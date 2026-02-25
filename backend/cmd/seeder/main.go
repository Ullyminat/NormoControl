package main

import (
	"academic-check-sys/internal/database"
	"fmt"
	"log"
	"math/rand"
	"time"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	database.InitDB()

	// Ensure tables exist (InitDB does this)

	log.Println("Seeding database...")
	seedUsers()
	seedStandards()
	seedResults()
	log.Println("Database seeded successfully!")
}

func seedUsers() {
	password := "password123"
	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	hash := string(hashedPassword)

	users := []struct {
		Email    string
		Role     string
		FullName string
	}{
		{"teacher@example.com", "teacher", "Иван Петров (Преподаватель)"},
		{"student@example.com", "student", "Алексей Смирнов"},
		{"admin@example.com", "admin", "Администратор"},
	}

	stmt, err := database.DB.Prepare("INSERT INTO users(email, password_hash, role, full_name, is_active) VALUES(?, ?, ?, ?, ?)")
	if err != nil {
		log.Fatal(err)
	}
	defer stmt.Close()

	for _, u := range users {
		_, err := stmt.Exec(u.Email, hash, u.Role, u.FullName, true)
		if err == nil {
			fmt.Printf("Created user: %s\n", u.Email)
		} else {
			fmt.Printf("User already exists: %s\n", u.Email)
		}
	}

	// 50 Random Students
	for i := 1; i <= 50; i++ {
		email := fmt.Sprintf("student%d@example.com", i)
		name := fmt.Sprintf("Студент %d", i)
		_, err := stmt.Exec(email, hash, "student", name, true)
		if err == nil {
			// fmt.Printf("Created user: %s\n", email)
		}
	}
	fmt.Println("Created 50 random students")
}

func seedStandards() {
	standards := []struct {
		Name        string
		Description string
		IsPublic    bool
	}{
		{"ГОСТ 7.32-2017", "Отчет о научно-исследовательской работе", true},
		{"APA Style 7th", "American Psychological Association", true},
		{"Методичка МГТУ", "Требования к курсовым работам МГТУ", true},
		{"IEEE Standard", "Institute of Electrical and Electronics Engineers", false},
	}

	// 1. Get Teacher ID
	var teacherID uint
	err := database.DB.QueryRow("SELECT id FROM users WHERE email = ?", "teacher@example.com").Scan(&teacherID)
	if err != nil {
		log.Printf("Teacher not found, using ID 1: %v", err)
		teacherID = 1
	}

	// 2. Prepare Insert with modules_json
	stmt, err := database.DB.Prepare("INSERT INTO formatting_standards(name, description, created_by, is_public, document_type, modules_json) VALUES(?, ?, ?, ?, ?, ?)")
	if err != nil {
		log.Fatal(err)
	}
	defer stmt.Close()

	for _, s := range standards {
		// Use "report" as default doc type, and "[]" for empty modules
		_, err := stmt.Exec(s.Name, s.Description, teacherID, s.IsPublic, "report", "[]")
		if err == nil {
			fmt.Printf("Created standard: %s\n", s.Name)
		} else {
			// log.Printf("Failed to create standard %s: %v\n", s.Name, err)
		}
	}
}

func seedResults() {
	// Generate 200 random checks over last 30 days
	stmt, err := database.DB.Prepare(`
		INSERT INTO check_results(document_id, standard_id, check_date, overall_score, total_rules, passed_rules, failed_rules, processing_time) 
		VALUES(?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		log.Fatal(err)
	}
	defer stmt.Close()

	rand.Seed(time.Now().UnixNano())

	for i := 0; i < 200; i++ {
		// Random Standard 1-4
		standardID := rand.Intn(4) + 1
		documentID := rand.Intn(100) + 1 // Fake doc ID

		// Random date in last 30 days
		daysAgo := rand.Intn(30)
		checkDate := time.Now().AddDate(0, 0, -daysAgo)

		// Random score skewed towards high
		score := 50 + rand.Float64()*50 // 50-100

		totalRules := 20
		passedRules := int(float64(totalRules) * (score / 100))
		failedRules := totalRules - passedRules
		procTime := 100 + rand.Intn(400) // 100-500ms

		_, err := stmt.Exec(documentID, standardID, checkDate, score, totalRules, passedRules, failedRules, procTime)
		if err != nil {
			log.Println("Error inserting result:", err)
		}
	}
	fmt.Println("Created 200 random check results")
}
