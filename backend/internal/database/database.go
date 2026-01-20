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
}

func createTables() {
	queries := []string{
		`DROP TABLE IF EXISTS formatting_standards;`, // Dev reset
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
			suggestion TEXT
		);`,
	}

	for _, query := range queries {
		_, err := DB.Exec(query)
		if err != nil {
			log.Printf("Error creating table: %v\nQuery: %s\n", err, query)
		}
	}

	// Migration: Add content_json if not exists
	// We blindly try to add it. SQLite will return error if exists.
	_, _ = DB.Exec(`ALTER TABLE check_results ADD COLUMN content_json TEXT;`)
}
