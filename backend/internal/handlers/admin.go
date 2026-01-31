package handlers

import (
	"academic-check-sys/internal/database"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type AdminStats struct {
	TotalUsers     int      `json:"total_users"`
	TotalChecks    int      `json:"total_checks"`
	PassRate       float64  `json:"pass_rate"`
	TotalStandards int      `json:"total_standards"`
	ChecksPerDay   []int    `json:"checks_per_day"`
	ChecksLabels   []string `json:"checks_labels"`
	PassRateStats  []int    `json:"pass_rate_stats"` // [Passed, Failed]
	AverageScore   float64  `json:"average_score"`
}

func GetAdminStats(c *gin.Context) {
	// 1. Total Users
	var totalUsers int
	database.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&totalUsers)

	// 2. Total Checks
	var totalChecks int
	database.DB.QueryRow("SELECT COUNT(*) FROM check_results").Scan(&totalChecks)

	// 3. Pass Rate (Score >= 50)
	var passedChecks int
	database.DB.QueryRow("SELECT COUNT(*) FROM check_results WHERE overall_score >= 50").Scan(&passedChecks)

	passRate := 0.0
	if totalChecks > 0 {
		passRate = float64(passedChecks) / float64(totalChecks) * 100
	}

	// 4. Activity (Last 7 days)
	// Query real data per day
	labels := []string{}
	data := []int{}

	now := time.Now()
	for i := 6; i >= 0; i-- {
		day := now.AddDate(0, 0, -i)
		// Format Label: "30.01"
		labels = append(labels, day.Format("02.01"))

		// Count checks for this day
		// SQLite date function: strftime('%Y-%m-%d', check_date)
		dayStr := day.Format("2006-01-02")
		var count int
		// Note matching only the DATE part
		database.DB.QueryRow("SELECT COUNT(*) FROM check_results WHERE date(check_date) = ?", dayStr).Scan(&count)
		data = append(data, count)
	}

	// 5. Pass/Fail Distribution
	// [Passed, Failed]
	failedChecks := totalChecks - passedChecks
	passRateStats := []int{passedChecks, failedChecks}

	// 6. Average Score
	var avgScore float64
	database.DB.QueryRow("SELECT COALESCE(AVG(overall_score), 0) FROM check_results").Scan(&avgScore)

	// 7. Total Standards
	var totalStandards int
	database.DB.QueryRow("SELECT COUNT(*) FROM formatting_standards").Scan(&totalStandards)

	c.JSON(http.StatusOK, AdminStats{
		TotalUsers:     totalUsers,
		TotalChecks:    totalChecks,
		PassRate:       passRate,
		TotalStandards: totalStandards,
		ChecksPerDay:   data,
		ChecksLabels:   labels,
		PassRateStats:  passRateStats,
		AverageScore:   avgScore,
	})
}

type UserDTO struct {
	ID       int    `json:"id"`
	Email    string `json:"email"`
	FullName string `json:"full_name"`
	Role     string `json:"role"`
	Status   string `json:"status"` // derived from is_active
}

func GetUsers(c *gin.Context) {
	rows, err := database.DB.Query("SELECT id, email, full_name, role, is_active FROM users ORDER BY id DESC")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	defer rows.Close()

	var users []UserDTO
	for rows.Next() {
		var u UserDTO
		var isActive bool
		if err := rows.Scan(&u.ID, &u.Email, &u.FullName, &u.Role, &isActive); err != nil {
			continue
		}
		if isActive {
			u.Status = "active"
		} else {
			u.Status = "inactive"
		}
		users = append(users, u)
	}

	c.JSON(http.StatusOK, users)
}

func DeleteUser(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID required"})
		return
	}

	_, err := database.DB.Exec("DELETE FROM users WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User deleted"})
}

// Optional: toggle active instead of delete
func ToggleUserStatus(c *gin.Context) {
	id := c.Param("id")
	_, err := database.DB.Exec("UPDATE users SET is_active = NOT is_active WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "User status updated"})
}
