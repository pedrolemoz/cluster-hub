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
	"strconv"
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
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			name        TEXT    NOT NULL,
			uuid        TEXT    UNIQUE NOT NULL,
			ip          TEXT    NOT NULL,
			mac         TEXT    NOT NULL,
			port        INTEGER NOT NULL DEFAULT 8080,
			is_online   INTEGER NOT NULL DEFAULT 0,
			last_seen_at TEXT,
			created_at  TEXT    NOT NULL,
			updated_at  TEXT    NOT NULL
		)
	`)
	return err
}

func scanMachine(row rowScanner) (Machine, error) {
	var m Machine
	var isOnline int
	var lastSeen sql.NullString
	err := row.Scan(&m.ID, &m.Name, &m.UUID, &m.IP, &m.MAC, &m.Port,
		&isOnline, &lastSeen, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		return m, err
	}
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

const machineSelect = `SELECT id, name, uuid, ip, mac, port, is_online, last_seen_at, created_at, updated_at FROM machines`

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
		Name string `json:"name"`
		IP   string `json:"ip"`
		MAC  string `json:"mac"`
		Port int    `json:"port"`
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
	now := time.Now().UTC().Format(time.RFC3339)
	result, err := db.Exec(
		`INSERT INTO machines (name, uuid, ip, mac, port, is_online, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
		body.Name, uuid.New().String(), body.IP, body.MAC, body.Port, now, now,
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
		Name string `json:"name"`
		IP   string `json:"ip"`
		MAC  string `json:"mac"`
		Port int    `json:"port"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Port == 0 {
		body.Port = 8080
	}
	now := time.Now().UTC().Format(time.RFC3339)
	_, err = db.Exec(
		`UPDATE machines SET name=?, ip=?, mac=?, port=?, updated_at=? WHERE id=?`,
		body.Name, body.IP, body.MAC, body.Port, now, id,
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

func sendWOL(mac string) error {
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
	conn, err := net.Dial("udp4", "255.255.255.255:9")
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
	var mac string
	if err := db.QueryRow(`SELECT mac FROM machines WHERE id=?`, id).Scan(&mac); err == sql.ErrNoRows {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	} else if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if err := sendWOL(mac); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "wol_sent"})
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

	go healthPoller()

	app := fiber.New(fiber.Config{
		DisableStartupMessage: false,
	})
	app.Use(cors.New())

	app.Get("/api/machines", getMachines)
	app.Post("/api/machines", addMachine)
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
		Index:        "index.html",
		NotFoundFile: "index.html",
	})

	log.Printf("cluster-hub backend listening on %s:%s", bindAddr, port)
	log.Fatal(app.Listen(bindAddr + ":" + port))
}
