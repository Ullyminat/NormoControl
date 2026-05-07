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
	var documentUserID uint
	var contextText sql.NullString
	var aiExplanation sql.NullString
	var suggestion sql.NullString
	err = database.DB.QueryRow(`
		SELECT v.id, v.rule_type, v.description, v.expected_value, v.actual_value, v.context_text,
		       v.ai_verified, v.ai_explanation, v.suggestion, v.is_doubtful, d.user_id
		FROM violations v
		JOIN check_results cr ON cr.id = v.result_id
		JOIN documents d ON d.id = cr.document_id
		WHERE v.id = ?`, violationID).Scan(
		&v.ID, &v.RuleType, &v.Description, &v.ExpectedValue, &v.ActualValue, &contextText,
		&v.AIVerified, &aiExplanation, &suggestion, &v.IsDoubtful, &documentUserID)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "Violation not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	v.ContextText = contextText.String
	v.AIExplanation = aiExplanation.String
	v.Suggestion = suggestion.String

	userID := c.GetUint("user_id")
	role, _ := c.Get("role")
	if role != "teacher" && role != "admin" && documentUserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
		return
	}

	if v.AIVerified {
		c.JSON(http.StatusOK, gin.H{
			"is_valid":    !v.IsDoubtful,
			"explanation": v.AIExplanation,
			"suggestion":  v.Suggestion,
			"cached":      true,
		})
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
