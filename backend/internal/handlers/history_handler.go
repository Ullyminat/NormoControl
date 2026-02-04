package handlers

import (
	"academic-check-sys/internal/database"
	"academic-check-sys/internal/models"
	"database/sql"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

type HistoryItem struct {
	ID           uint    `json:"id"` // CheckResult ID
	DocumentName string  `json:"document_name"`
	CheckDate    string  `json:"check_date"`
	Score        float64 `json:"score"`
	Status       string  `json:"status"`
}

type TeacherHistoryItem struct {
	ID           uint    `json:"id"`
	StudentName  string  `json:"student_name"`
	StandardName string  `json:"standard_name"`
	CheckDate    string  `json:"check_date"`
	Score        float64 `json:"score"`
}

func GetHistory(c *gin.Context) {
	userID := c.GetUint("user_id")
	// var userID uint = 1 // Use context user ID now

	rows, err := database.DB.Query(`
		SELECT cr.id, d.file_name, cr.check_date, cr.overall_score, d.status
		FROM check_results cr
		JOIN documents d ON cr.document_id = d.id
		WHERE d.user_id = ?
		ORDER BY cr.check_date DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch history"})
		return
	}
	defer rows.Close()

	var response []HistoryItem
	for rows.Next() {
		var h HistoryItem
		var score float64
		if err := rows.Scan(&h.ID, &h.DocumentName, &h.CheckDate, &score, &h.Status); err != nil {
			continue
		}
		h.Score = score
		response = append(response, h)
	}

	if response == nil {
		response = []HistoryItem{}
	}

	fmt.Printf("📊 GetHistory: Sending %d items\n", len(response))
	if len(response) > 0 {
		fmt.Printf("📊 First item: DocumentName=%s, Score=%f\n", response[0].DocumentName, response[0].Score)
	}

	c.JSON(http.StatusOK, response)
}

func GetHistoryDetail(c *gin.Context) {
	id := c.Param("id")
	userID := c.GetUint("user_id")

	var result struct {
		ID           uint
		DocumentName string
		CheckDate    string
		Score        float64
		ContentJSON  string
	}

	err := database.DB.QueryRow(`
		SELECT cr.id, d.file_name, cr.check_date, cr.overall_score, cr.content_json
		FROM check_results cr
		JOIN documents d ON cr.document_id = d.id
		WHERE cr.id = ? AND d.user_id = ?
	`, id, userID).Scan(&result.ID, &result.DocumentName, &result.CheckDate, &result.Score, &result.ContentJSON)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "History item not found"})
		return
	}

	fetchViolationsAndRespond(c, result.ID, result.DocumentName, result.CheckDate, result.Score, result.ContentJSON)
}

func GetTeacherHistory(c *gin.Context) {
	teacherID := c.GetUint("user_id")

	// Find checks against standards created by this teacher
	rows, err := database.DB.Query(`
		SELECT cr.id, u.full_name, s.name, cr.check_date, cr.overall_score
		FROM check_results cr
		JOIN formatting_standards s ON cr.standard_id = s.id
		JOIN documents d ON cr.document_id = d.id
		JOIN users u ON d.user_id = u.id
		WHERE s.created_by = ?
		ORDER BY cr.check_date DESC
	`, teacherID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch teacher history"})
		return
	}
	defer rows.Close()

	var response []TeacherHistoryItem
	for rows.Next() {
		var h TeacherHistoryItem
		var score float64
		// full_name might be null if not set, handle scan carefully if needed,
		// but User struct defines it as string so usually empty string if not NULL DB constraint.
		// Assuming full_name is NOT NULL or we handle it.
		if err := rows.Scan(&h.ID, &h.StudentName, &h.StandardName, &h.CheckDate, &score); err != nil {
			continue
		}
		h.Score = score
		response = append(response, h)
	}

	if response == nil {
		response = []TeacherHistoryItem{}
	}

	fmt.Printf("📊 GetTeacherHistory: Sending %d items\n", len(response))
	if len(response) > 0 {
		fmt.Printf("📊 First item: StudentName=%s, Score=%f\n", response[0].StudentName, response[0].Score)
	}

	c.JSON(http.StatusOK, response)
}

func GetTeacherHistoryDetail(c *gin.Context) {
	id := c.Param("id")
	teacherID := c.GetUint("user_id")

	var result struct {
		ID           uint
		DocumentName string
		StudentName  string
		StandardName string
		CheckDate    string
		Score        float64
		ContentJSON  string
	}

	// Verify the check belongs to a standard created by the teacher
	err := database.DB.QueryRow(`
		SELECT cr.id, d.file_name, u.full_name, s.name, cr.check_date, cr.overall_score, cr.content_json
		FROM check_results cr
		JOIN formatting_standards s ON cr.standard_id = s.id
		JOIN documents d ON cr.document_id = d.id
		JOIN users u ON d.user_id = u.id
		WHERE cr.id = ? AND s.created_by = ?
	`, id, teacherID).Scan(&result.ID, &result.DocumentName, &result.StudentName, &result.StandardName, &result.CheckDate, &result.Score, &result.ContentJSON)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Record not found or access denied"})
		return
	}

	fetchViolationsAndRespondTeacher(c, result.ID, result.DocumentName, result.StudentName, result.StandardName, result.CheckDate, result.Score, result.ContentJSON)
}

func fetchViolationsAndRespondTeacher(c *gin.Context, resultID uint, docName, studentName, standardName, checkDate string, score float64, contentJSON string) {
	rows, err := database.DB.Query(`
		SELECT id, rule_type, description, severity, position_in_doc, expected_value, actual_value, suggestion
		FROM violations
		WHERE result_id = ?
		ORDER BY id ASC
	`, resultID)

	var violations []models.Violation
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var v models.Violation
			v.ResultID = resultID
			var suggestion sql.NullString
			if err := rows.Scan(&v.ID, &v.RuleType, &v.Description, &v.Severity, &v.PositionInDoc, &v.ExpectedValue, &v.ActualValue, &suggestion); err == nil {
				if suggestion.Valid {
					v.Suggestion = suggestion.String
				}
				violations = append(violations, v)
			}
		}
	}

	if violations == nil {
		violations = []models.Violation{}
	}

	c.JSON(http.StatusOK, gin.H{
		"id":            resultID,
		"document_name": docName,
		"student_name":  studentName,
		"standard_name": standardName,
		"check_date":    checkDate,
		"score":         score,
		"content_json":  contentJSON,
		"violations":    violations,
	})
}

// Helper to fetch violations and send JSON response
func fetchViolationsAndRespond(c *gin.Context, resultID uint, docName, checkDate string, score float64, contentJSON string) {
	rows, err := database.DB.Query(`
		SELECT id, rule_type, description, severity, position_in_doc, expected_value, actual_value, suggestion
		FROM violations
		WHERE result_id = ?
		ORDER BY id ASC
	`, resultID)

	var violations []models.Violation
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var v models.Violation
			v.ResultID = resultID
			var suggestion sql.NullString
			if err := rows.Scan(&v.ID, &v.RuleType, &v.Description, &v.Severity, &v.PositionInDoc, &v.ExpectedValue, &v.ActualValue, &suggestion); err == nil {
				if suggestion.Valid {
					v.Suggestion = suggestion.String
				}
				violations = append(violations, v)
			}
		}
	}

	if violations == nil {
		violations = []models.Violation{}
	}

	c.JSON(http.StatusOK, gin.H{
		"id":            resultID,
		"document_name": docName,
		"check_date":    checkDate,
		"score":         score,
		"content_json":  contentJSON,
		"violations":    violations,
	})
}
