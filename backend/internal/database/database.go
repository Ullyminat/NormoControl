package database

import (
	"database/sql"
	"log"

	_ "modernc.org/sqlite"
)

var DB *sql.DB

func InitDB() {
	var err error
	DB, err = sql.Open("sqlite", "./academic.db")
	if err != nil {
		log.Fatal(err)
	}

	if err = DB.Ping(); err != nil {
		log.Fatal(err)
	}

	log.Println("Database connected")
	createTables()
	SeedData()
}

func SeedData() {
	// 1. Seed Admin User if no users exist
	var userCount int
	err := DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&userCount)
	if err == nil && userCount == 0 {
		log.Println("Seeding default admin user...")
		// Password: admin123
		adminHash := "$2a$10$8KzVv8x8.yVp.Y.R1b7eOe/e8o/wY1k0H7vP1pG.mP9Z6R1x5yY6i"
		_, err = DB.Exec("INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)", 
			"admin@example.com", adminHash, "admin", "System Administrator")
		if err != nil {
			log.Printf("Error seeding admin: %v", err)
		}
	}

	// 2. Seed Default Standards if none exist
	var standardCount int
	err = DB.QueryRow("SELECT COUNT(*) FROM formatting_standards").Scan(&standardCount)
	if err == nil && standardCount == 0 {
		log.Println("Seeding initial formatting standards...")
		_, err = DB.Exec(`INSERT INTO formatting_standards (name, description, created_by, is_public, document_type, modules_json) 
			VALUES (?, ?, ?, ?, ?, ?)`, 
			"ГОСТ 7.32-2017", "Стандарт для отчетов о НИР", 1, true, "report", "[]")
		if err != nil {
			log.Printf("Error seeding standards: %v", err)
		}
	}
}

func createTables() {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			role TEXT NOT NULL,
			full_name TEXT,
			group_id INTEGER,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			is_active BOOLEAN DEFAULT TRUE
		);`,
		`CREATE TABLE IF NOT EXISTS student_groups (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			group_name TEXT NOT NULL UNIQUE,
			faculty TEXT,
			specialty_code TEXT,
			specialty_name TEXT,
			curator_id INTEGER,
			created_year INTEGER
		);`,
		`CREATE TABLE IF NOT EXISTS formatting_standards (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			description TEXT,
			created_by INTEGER,
			document_type TEXT,
			is_public BOOLEAN DEFAULT FALSE,
			modules_json TEXT, -- JSON stored as text
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS documents (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER,
			file_name TEXT,
			file_path TEXT,
			file_size INTEGER,
			upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
			status TEXT,
			metadata_json TEXT
		);`,
		`CREATE TABLE IF NOT EXISTS check_results (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			document_id INTEGER,
			standard_id INTEGER,
			check_date DATETIME DEFAULT CURRENT_TIMESTAMP,
			overall_score REAL,
			total_rules INTEGER,
			passed_rules INTEGER,
			failed_rules INTEGER,
			processing_time INTEGER,
			report_path TEXT,
			content_json TEXT
		);`,
		`CREATE TABLE IF NOT EXISTS violations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			result_id INTEGER,
			rule_type TEXT,
			description TEXT,
			severity TEXT,
			position_in_doc TEXT,
			expected_value TEXT,
			actual_value TEXT,
			suggestion TEXT,
			context_text TEXT,
			is_doubtful BOOLEAN DEFAULT FALSE,
			ai_verified BOOLEAN DEFAULT FALSE,
			ai_explanation TEXT
		);`,
	}

	for _, query := range queries {
		_, err := DB.Exec(query)
		if err != nil {
			log.Printf("Error creating table: %v\nQuery: %s\n", err, query)
		}
	}

	// Migrations
	_, _ = DB.Exec(`ALTER TABLE check_results ADD COLUMN content_json TEXT;`)
	_, _ = DB.Exec(`ALTER TABLE violations ADD COLUMN context_text TEXT;`)
	_, _ = DB.Exec(`ALTER TABLE violations ADD COLUMN is_doubtful BOOLEAN DEFAULT FALSE;`)
	_, _ = DB.Exec(`ALTER TABLE violations ADD COLUMN ai_verified BOOLEAN DEFAULT FALSE;`)
	_, _ = DB.Exec(`ALTER TABLE violations ADD COLUMN ai_explanation TEXT;`)
}
