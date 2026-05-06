package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"bufio"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

var (
	db          *sql.DB
	pingLatency sync.Map // map[int64]*int64 machine_id -> ms
)

type Machine struct {
	ID         int64   `json:"id"`
	Name       string  `json:"name"`
	UUID       string  `json:"uuid"`
	IP         string  `json:"ip"`
	MAC        string  `json:"mac"`
	Port       int     `json:"port"`
	UseWoWLAN  bool    `json:"use_wowlan"`
	IsOnline   bool    `json:"is_online"`
	LastSeenAt *string `json:"last_seen_at"`
	CreatedAt  string  `json:"created_at"`
	UpdatedAt  string  `json:"updated_at"`
	PingMs     *int64  `json:"ping_ms"`
}

type rowScanner interface {
	Scan(dest ...any) error
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func initDB() error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS machines (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			name         TEXT    NOT NULL,
			uuid         TEXT    UNIQUE NOT NULL,
			ip           TEXT    NOT NULL,
			mac          TEXT    NOT NULL,
			port         INTEGER NOT NULL DEFAULT 8080,
			use_wowlan   INTEGER NOT NULL DEFAULT 0,
			is_online    INTEGER NOT NULL DEFAULT 0,
			last_seen_at TEXT,
			created_at   TEXT    NOT NULL,
			updated_at   TEXT    NOT NULL
		)
	`)
	if err != nil {
		return err
	}
	// migrate existing DBs that lack the column
	db.Exec(`ALTER TABLE machines ADD COLUMN use_wowlan INTEGER NOT NULL DEFAULT 0`)
	return nil
}

func scanMachine(row rowScanner) (Machine, error) {
	var m Machine
	var useWoWLAN, isOnline int
	var lastSeen sql.NullString
	err := row.Scan(&m.ID, &m.Name, &m.UUID, &m.IP, &m.MAC, &m.Port, &useWoWLAN,
		&isOnline, &lastSeen, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		return m, err
	}
	m.UseWoWLAN = useWoWLAN == 1
	m.IsOnline = isOnline == 1
	if lastSeen.Valid {
		m.LastSeenAt = &lastSeen.String
	}
	if v, ok := pingLatency.Load(m.ID); ok {
		ms := v.(int64)
		m.PingMs = &ms
	}
	return m, nil
}

const machineSelect = `SELECT id, name, uuid, ip, mac, port, use_wowlan, is_online, last_seen_at, created_at, updated_at FROM machines`

func getMachines(c *fiber.Ctx) error {
	rows, err := db.Query(machineSelect + ` ORDER BY is_online DESC, name ASC`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	machines := []Machine{}
	for rows.Next() {
		m, err := scanMachine(rows)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		machines = append(machines, m)
	}
	return c.JSON(machines)
}

func addMachine(c *fiber.Ctx) error {
	var body struct {
		Name      string `json:"name"`
		IP        string `json:"ip"`
		MAC       string `json:"mac"`
		Port      int    `json:"port"`
		UseWoWLAN bool   `json:"use_wowlan"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Name == "" || body.IP == "" || body.MAC == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name, ip, mac required"})
	}
	if body.Port == 0 {
		body.Port = 8080
	}
	useWoWLAN := 0
	if body.UseWoWLAN {
		useWoWLAN = 1
	}
	now := time.Now().UTC().Format(time.RFC3339)
	result, err := db.Exec(
		`INSERT INTO machines (name, uuid, ip, mac, port, use_wowlan, is_online, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
		body.Name, uuid.New().String(), body.IP, body.MAC, body.Port, useWoWLAN, now, now,
	)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	rowID, _ := result.LastInsertId()
	row := db.QueryRow(machineSelect+` WHERE id = ?`, rowID)
	m, err := scanMachine(row)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(m)
}

func editMachine(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid id"})
	}
	var body struct {
		Name      string `json:"name"`
		IP        string `json:"ip"`
		MAC       string `json:"mac"`
		Port      int    `json:"port"`
		UseWoWLAN bool   `json:"use_wowlan"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Port == 0 {
		body.Port = 8080
	}
	useWoWLAN := 0
	if body.UseWoWLAN {
		useWoWLAN = 1
	}
	now := time.Now().UTC().Format(time.RFC3339)
	_, err = db.Exec(
		`UPDATE machines SET name=?, ip=?, mac=?, port=?, use_wowlan=?, updated_at=? WHERE id=?`,
		body.Name, body.IP, body.MAC, body.Port, useWoWLAN, now, id,
	)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	row := db.QueryRow(machineSelect+` WHERE id = ?`, id)
	m, err := scanMachine(row)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(m)
}

func deleteMachine(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid id"})
	}
	_, err = db.Exec(`DELETE FROM machines WHERE id=?`, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}

func sendWOL(mac, broadcast string) error {
	hw, err := net.ParseMAC(mac)
	if err != nil {
		return fmt.Errorf("invalid MAC: %w", err)
	}
	packet := make([]byte, 102)
	for i := 0; i < 6; i++ {
		packet[i] = 0xFF
	}
	for i := 1; i <= 16; i++ {
		copy(packet[i*6:], hw)
	}
	conn, err := net.Dial("udp4", broadcast+":9")
	if err != nil {
		return err
	}
	defer conn.Close()
	_, err = conn.Write(packet)
	return err
}

func wakeMachine(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid id"})
	}
	var mac, ip string
	var useWoWLAN int
	if err := db.QueryRow(`SELECT mac, ip, use_wowlan FROM machines WHERE id=?`, id).Scan(&mac, &ip, &useWoWLAN); err == sql.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	} else if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	broadcast := "255.255.255.255"
	if useWoWLAN == 1 {
		broadcast = ip
	}
	if err := sendWOL(mac, broadcast); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	mode := "wol_sent"
	if useWoWLAN == 1 {
		mode = "wowlan_sent"
	}
	return c.JSON(fiber.Map{"status": mode})
}

func shutdownMachine(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid id"})
	}
	var ip string
	var port int
	if err := db.QueryRow(`SELECT ip, port FROM machines WHERE id=?`, id).Scan(&ip, &port); err == sql.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	} else if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Post(fmt.Sprintf("http://%s:%d/shutdown", ip, port), "application/json", nil)
	if err != nil {
		return c.Status(503).JSON(fiber.Map{"error": "agent unreachable"})
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var result any
	json.Unmarshal(body, &result)
	return c.Status(resp.StatusCode).JSON(result)
}

func getMachineHealth(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid id"})
	}
	var isOnline int
	if err := db.QueryRow(`SELECT is_online FROM machines WHERE id=?`, id).Scan(&isOnline); err == sql.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	} else if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if isOnline == 0 {
		return c.Status(503).JSON(fiber.Map{"status": "offline"})
	}
	return c.JSON(fiber.Map{"status": "online"})
}

func getMachineMetrics(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid id"})
	}
	var ip string
	var port, isOnline int
	if err := db.QueryRow(`SELECT ip, port, is_online FROM machines WHERE id=?`, id).Scan(&ip, &port, &isOnline); err == sql.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	} else if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if isOnline == 0 {
		return c.Status(503).JSON(fiber.Map{"error": "offline"})
	}
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://%s:%d/metrics", ip, port))
	if err != nil {
		return c.Status(503).JSON(fiber.Map{"error": "agent unreachable"})
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var result any
	json.Unmarshal(body, &result)
	return c.Status(resp.StatusCode).JSON(result)
}

func getVersion(c *fiber.Ctx) error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "cannot determine home dir"})
	}
	installDir := filepath.Join(homeDir, "cluster-hub-dev")

	current := "unknown"
	if out, err := exec.Command("git", "-C", installDir, "rev-parse", "HEAD").Output(); err == nil {
		current = strings.TrimSpace(string(out))
	}

	latest := "unknown"
	if out, err := exec.Command("git", "ls-remote", "https://github.com/pedrolemoz/cluster-hub.git", "HEAD").Output(); err == nil {
		parts := strings.Fields(string(out))
		if len(parts) > 0 {
			latest = parts[0]
		}
	}

	return c.JSON(fiber.Map{
		"current":          current,
		"latest":           latest,
		"update_available": current != "unknown" && latest != "unknown" && current != latest,
	})
}

func exportMachinesJSON() ([]byte, error) {
	rows, err := db.Query(`SELECT name, ip, mac, port, use_wowlan FROM machines`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type machineExport struct {
		Name      string `json:"name"`
		IP        string `json:"ip"`
		MAC       string `json:"mac"`
		Port      int    `json:"port"`
		UseWoWLAN bool   `json:"use_wowlan"`
	}
	var machines []machineExport
	for rows.Next() {
		var m machineExport
		var useWowlan int
		if err := rows.Scan(&m.Name, &m.IP, &m.MAC, &m.Port, &useWowlan); err != nil {
			continue
		}
		m.UseWoWLAN = useWowlan == 1
		machines = append(machines, m)
	}
	return json.MarshalIndent(machines, "", "  ")
}

const (
	rawBaseURL     = "https://raw.githubusercontent.com/pedrolemoz/cluster-hub/main"
	uninstallShURL = rawBaseURL + "/scripts/uninstall.sh"
	installShURL   = rawBaseURL + "/scripts/install.sh"
)

func downloadFile(url, dest string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("HTTP %d fetching %s", resp.StatusCode, url)
	}
	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	return err
}

func importPendingBackup() {
	backupFile := filepath.Join(os.TempDir(), "cluster-hub-update", "machines.json")
	data, err := os.ReadFile(backupFile)
	if err != nil {
		return
	}
	var entries []struct {
		Name      string `json:"name"`
		IP        string `json:"ip"`
		MAC       string `json:"mac"`
		Port      int    `json:"port"`
		UseWoWLAN bool   `json:"use_wowlan"`
	}
	if err := json.Unmarshal(data, &entries); err != nil {
		log.Printf("backup import: parse error: %v", err)
		os.Remove(backupFile)
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	ok := 0
	for _, e := range entries {
		if e.Port == 0 {
			e.Port = 8080
		}
		useWoWLAN := 0
		if e.UseWoWLAN {
			useWoWLAN = 1
		}
		_, err := db.Exec(
			`INSERT INTO machines (name, uuid, ip, mac, port, use_wowlan, is_online, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
			e.Name, uuid.New().String(), e.IP, e.MAC, e.Port, useWoWLAN, now, now,
		)
		if err == nil {
			ok++
		}
	}
	os.Remove(backupFile)
	os.Remove(filepath.Dir(backupFile))
	if ok > 0 {
		log.Printf("auto-import: restored %d machine(s) from update backup", ok)
	}
}

const windowsUpdateScript = `Start-Sleep -Seconds 2

function Fetch-Run([string]$Url) {
    $tmp = [System.IO.Path]::GetTempFileName() + ".ps1"
    Invoke-WebRequest -Uri $Url -OutFile $tmp -UseBasicParsing
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $tmp
    Remove-Item $tmp -ErrorAction SilentlyContinue
}

Fetch-Run "https://raw.githubusercontent.com/pedrolemoz/cluster-hub/main/scripts/uninstall.ps1"
Fetch-Run "https://raw.githubusercontent.com/pedrolemoz/cluster-hub/main/scripts/install.ps1"
`

func launchUpdateWindows(tmpDir string) error {
	scriptPath := filepath.Join(tmpDir, "update.ps1")
	if err := os.WriteFile(scriptPath, []byte(windowsUpdateScript), 0644); err != nil {
		return err
	}
	return exec.Command(
		"cmd", "/c", "start", "/b", "powershell",
		"-NoProfile", "-ExecutionPolicy", "Bypass",
		"-File", scriptPath,
	).Run()
}

func streamUpdate(c *fiber.Ctx) error {
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		send := func(msg string) {
			fmt.Fprintf(w, "data: %s\n\n", msg)
			w.Flush()
		}

		if runtime.GOOS != "linux" && runtime.GOOS != "windows" {
			send("ERROR: update not supported on " + runtime.GOOS)
			return
		}

		send("Exporting machine config...")
		data, err := exportMachinesJSON()
		if err != nil {
			send("ERROR: export failed: " + err.Error())
			return
		}

		tmpDir := filepath.Join(os.TempDir(), "cluster-hub-update")
		if err := os.MkdirAll(tmpDir, 0755); err != nil {
			send("ERROR: cannot create temp dir: " + err.Error())
			return
		}

		if err := os.WriteFile(filepath.Join(tmpDir, "machines.json"), data, 0644); err != nil {
			os.RemoveAll(tmpDir)
			send("ERROR: cannot write backup: " + err.Error())
			return
		}
		send("Machine config backed up.")

		if runtime.GOOS == "linux" {
			send("Downloading uninstall script...")
			if err := downloadFile(uninstallShURL, "/tmp/cluster-hub-uninstall.sh"); err != nil {
				os.RemoveAll(tmpDir)
				send("ERROR: " + err.Error())
				return
			}
			send("Downloading install script...")
			if err := downloadFile(installShURL, "/tmp/cluster-hub-install.sh"); err != nil {
				os.RemoveAll(tmpDir)
				send("ERROR: " + err.Error())
				return
			}
			os.Chmod("/tmp/cluster-hub-uninstall.sh", 0755)
			os.Chmod("/tmp/cluster-hub-install.sh", 0755)

			logFile := filepath.Join(tmpDir, "update.log")
			detachCmd := fmt.Sprintf(
				`nohup bash -c 'sudo -n bash /tmp/cluster-hub-uninstall.sh >> "%s" 2>&1 && sudo -n bash /tmp/cluster-hub-install.sh >> "%s" 2>&1; rm -f /tmp/cluster-hub-uninstall.sh /tmp/cluster-hub-install.sh' > /dev/null 2>&1 &`,
				logFile, logFile,
			)
			send("Launching update — server will restart now...")
			exec.Command("bash", "-c", detachCmd).Run()
		} else {
			send("Launching update — server will restart now...")
			if err := launchUpdateWindows(tmpDir); err != nil {
				os.RemoveAll(tmpDir)
				send("ERROR: " + err.Error())
			}
		}
	})

	return nil
}

func importMachinesAPI(c *fiber.Ctx) error {
	var entries []struct {
		Name      string `json:"name"`
		IP        string `json:"ip"`
		MAC       string `json:"mac"`
		Port      int    `json:"port"`
		UseWoWLAN bool   `json:"use_wowlan"`
	}
	if err := c.BodyParser(&entries); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid JSON"})
	}

	ok, fail := 0, 0
	now := time.Now().UTC().Format(time.RFC3339)
	for _, e := range entries {
		if e.Name == "" || e.IP == "" || e.MAC == "" {
			fail++
			continue
		}
		if e.Port == 0 {
			e.Port = 8080
		}
		useWoWLAN := 0
		if e.UseWoWLAN {
			useWoWLAN = 1
		}
		_, err := db.Exec(
			`INSERT INTO machines (name, uuid, ip, mac, port, use_wowlan, is_online, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
			e.Name, uuid.New().String(), e.IP, e.MAC, e.Port, useWoWLAN, now, now,
		)
		if err != nil {
			fail++
		} else {
			ok++
		}
	}
	return c.JSON(fiber.Map{"imported": ok, "failed": fail})
}

func healthPoller() {
	type entry struct {
		id   int64
		ip   string
		port int
	}
	client := &http.Client{Timeout: 2 * time.Second}

	for {
		rows, err := db.Query(`SELECT id, ip, port FROM machines`)
		if err != nil {
			time.Sleep(5 * time.Second)
			continue
		}
		var entries []entry
		for rows.Next() {
			var e entry
			rows.Scan(&e.id, &e.ip, &e.port)
			entries = append(entries, e)
		}
		rows.Close()

		for _, e := range entries {
			start := time.Now()
			resp, err := client.Get(fmt.Sprintf("http://%s:%d/health", e.ip, e.port))
			elapsed := time.Since(start).Milliseconds()
			now := time.Now().UTC().Format(time.RFC3339)
			if err == nil && resp.StatusCode == 200 {
				resp.Body.Close()
				db.Exec(`UPDATE machines SET is_online=1, last_seen_at=?, updated_at=? WHERE id=?`, now, now, e.id)
				pingLatency.Store(e.id, elapsed)
			} else {
				if resp != nil {
					resp.Body.Close()
				}
				db.Exec(`UPDATE machines SET is_online=0, updated_at=? WHERE id=?`, now, e.id)
				pingLatency.Delete(e.id)
			}
		}
		time.Sleep(5 * time.Second)
	}
}

func main() {
	port := getEnv("PORT", "3001")
	dbPath := getEnv("DB_PATH", "./cluster.db")
	bindAddr := getEnv("BIND_ADDR", "0.0.0.0")
	staticPath := getEnv("STATIC_PATH", "./web")

	var err error
	db, err = sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	defer db.Close()

	if err := initDB(); err != nil {
		log.Fatal(err)
	}
	importPendingBackup()

	go healthPoller()

	app := fiber.New(fiber.Config{
		DisableStartupMessage: false,
	})
	app.Use(cors.New())

	app.Get("/api/version", getVersion)
	app.Get("/api/update/stream", streamUpdate)
	app.Get("/api/machines", getMachines)
	app.Post("/api/machines", addMachine)
	app.Post("/api/machines/import", importMachinesAPI)
	app.Put("/api/machines/:id", editMachine)
	app.Delete("/api/machines/:id", deleteMachine)
	app.Post("/api/machines/:id/wake", wakeMachine)
	app.Post("/api/machines/:id/shutdown", shutdownMachine)
	app.Get("/api/machines/:id/health", getMachineHealth)
	app.Get("/api/machines/:id/metrics", getMachineMetrics)

	app.Use("/api", func(c *fiber.Ctx) error {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	})

	app.Static("/", staticPath, fiber.Static{
		Index: "index.html",
	})

	app.Use(func(c *fiber.Ctx) error {
		return c.SendFile(staticPath + "/index.html")
	})

	log.Printf("cluster-hub backend listening on %s:%s", bindAddr, port)
	log.Fatal(app.Listen(bindAddr + ":" + port))
}
