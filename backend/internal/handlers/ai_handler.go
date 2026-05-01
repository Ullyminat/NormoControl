package handlers

import (
	"academic-check-sys/internal/ai"
	"academic-check-sys/internal/database"
	"academic-check-sys/internal/models"
	"database/sql"
	"net/http"
	"os"
	"strconv"

	"github.com/gin-gonic/gin"
)

func VerifyViolationWithAI(c *gin.Context) {
	violationIDStr := c.Param("id")
	violationID, err := strconv.Atoi(violationIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid violation ID"})
		return
	}

	// 1. Fetch Violation from DB
	var v models.Violation
	err = database.DB.QueryRow(`
		SELECT id, rule_type, description, expected_value, actual_value, context_text 
		FROM violations WHERE id = ?`, violationID).Scan(
		&v.ID, &v.RuleType, &v.Description, &v.ExpectedValue, &v.ActualValue, &v.ContextText)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "Violation not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// 2. Initialize Gemini
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI Service is not configured (missing API Key)"})
		return
	}
	client := ai.NewGeminiClient(apiKey)

	// 3. Call AI
	aiResp, err := client.VerifyFragment(v.ContextText, v.RuleType, v.ExpectedValue, v.ActualValue)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AI Verification failed", "details": err.Error()})
		return
	}

	// 4. Update DB
	_, err = database.DB.Exec(`
		UPDATE violations 
		SET ai_verified = TRUE, ai_explanation = ?, suggestion = ?, is_doubtful = ? 
		WHERE id = ?`,
		aiResp.Explanation, aiResp.Suggestion, !aiResp.IsValid, v.ID)

	if err != nil {
		// Non-fatal for the user, but log it
	}

	c.JSON(http.StatusOK, gin.H{
		"is_valid":    aiResp.IsValid,
		"explanation": aiResp.Explanation,
		"suggestion":  aiResp.Suggestion,
	})
}
