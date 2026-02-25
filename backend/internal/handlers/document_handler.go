package handlers

import (
	"academic-check-sys/internal/checker"
	"academic-check-sys/internal/database"
	"academic-check-sys/internal/models"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// Default Standard for backward compatibility
const DefaultStandard = `{
	"margins": {"top": 20, "bottom": 20, "left": 30, "right": 10, "tolerance": 2.5},
	"font": {"name": "Times New Roman", "size": 14},
	"paragraph": {"line_spacing": 1.5, "alignment": "justify", "first_line_indent": 12.5}
}`

func UploadAndCheck(c *gin.Context) {
	// 1. Get File
	file, err := c.FormFile("document")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}

	// 2. Get Config (JSON string) and Standard ID
	configJSON := c.PostForm("config")
	if configJSON == "" {
		configJSON = DefaultStandard
	}

	standardIDStr := c.PostForm("standard_id")
	fmt.Printf("UploadAndCheck: standard_id param = '%s'\n", standardIDStr)

	var standardID int
	if standardIDStr != "" && standardIDStr != "undefined" && standardIDStr != "null" {
		var parseErr error
		standardID, parseErr = strconv.Atoi(standardIDStr)
		if parseErr != nil {
			fmt.Printf("UploadAndCheck: Failed to parse standard_id: %v\n", parseErr)
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid standard_id format"})
			return
		}
	} else {
		// If standard_id is missing, we can't save the result correctly for history.
		// However, for robustness, we might default to 0 or 1, but really we should require it.
		// Let's fallback to 1 but log warning.
		fmt.Println("UploadAndCheck: standard_id missing or undefined, defaulting to 1")
		standardID = 1
	}

	// 2. Save File
	// Create uploads dir if not exists
	uploadDir := "./uploads"
	if _, err := os.Stat(uploadDir); os.IsNotExist(err) {
		os.Mkdir(uploadDir, 0755)
	}

	filename := fmt.Sprintf("%d_%s", time.Now().Unix(), file.Filename)
	savePath := filepath.Join(uploadDir, filename)
	if err := c.SaveUploadedFile(file, savePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	// 3. Trigger Check
	svc := checker.NewCheckService()
	result, violations, err := svc.RunCheck(c.Request.Context(), savePath, configJSON)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Check failed: %v", err)})
		return
	}

	// 3.5. Convert to PDF for Frontend Display
	// We use LibreOffice (soffice) to convert the saved DOCX to PDF.
	// Output file will be [filename].pdf in the same dir.
	pdfFilename := filename[:len(filename)-len(filepath.Ext(filename))] + ".pdf"
	// Command: soffice --headless --convert-to pdf --outdir [uploadDir] [savePath]
	// Note: We need to use 'exec' package.

	// Ensure we are importing "os/exec"

	cmd := exec.Command("soffice", "--headless", "--convert-to", "pdf", "--outdir", uploadDir, savePath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Printf("PDF Conversion failed: %v, Output: %s\n", err, string(output))
		// We don't fail the whole request, but PDF won't be available.
		// c.JSON(http.StatusInternalServerError, gin.H{"error": "PDF Conversion failed"})
		// return
	} else {
		fmt.Printf("PDF Conversion success: %s\n", pdfFilename)
		result.ContentJSON = result.ContentJSON[:len(result.ContentJSON)-1] + fmt.Sprintf(`, "pdf_url": "/api/uploads/%s"}`, pdfFilename)
	}

	// 4. Save Results to DB
	userID := c.GetUint("user_id")
	if userID == 0 {
		fmt.Println("UploadAndCheck: UserID not found in context (Middleware issue?), defaulting to 1")
		userID = 1
	}

	// Insert Document Record
	docEntry := models.Document{
		UserID:     userID,
		FileName:   file.Filename,
		FilePath:   savePath,
		FileSize:   file.Size,
		UploadDate: time.Now(),
		Status:     "checked",
	}

	resDoc, err := database.DB.Exec("INSERT INTO documents (user_id, file_name, file_path, file_size, upload_date, status) VALUES (?, ?, ?, ?, ?, ?)",
		docEntry.UserID, docEntry.FileName, docEntry.FilePath, docEntry.FileSize, docEntry.UploadDate, docEntry.Status)

	if err != nil {
		fmt.Printf("UploadAndCheck: DB Error Inserting Document: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error saving document"})
		return
	}

	docID, _ := resDoc.LastInsertId()

	// Insert Result
	resCheck, err := database.DB.Exec("INSERT INTO check_results (document_id, standard_id, overall_score, total_rules, failed_rules, content_json) VALUES (?, ?, ?, ?, ?, ?)",
		docID, standardID, result.OverallScore, result.TotalRules, result.FailedRules, result.ContentJSON)

	if err != nil {
		fmt.Printf("UploadAndCheck: DB Error Inserting Result: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error saving results"})
		return
	}

	checkID, _ := resCheck.LastInsertId()

	// Insert Violations
	// Transaction would be better, but for now just execute
	tx, _ := database.DB.Begin()
	stmt, err := tx.Prepare("INSERT INTO violations (result_id, rule_type, description, severity, position_in_doc, expected_value, actual_value, suggestion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
	if err != nil {
		fmt.Printf("UploadAndCheck: DB Error Preparing Violations: %v\n", err)
		// Non-fatal, commit previous? No, just continue or error.
		// Let's allow partial failure or rollback.
		tx.Rollback()
	} else {
		for _, v := range violations {
			_, err = stmt.Exec(checkID, v.RuleType, v.Description, v.Severity, v.PositionInDoc, v.ExpectedValue, v.ActualValue, v.Suggestion)
			if err != nil {
				fmt.Printf("UploadAndCheck: DB Error Inserting Violation: %v\n", err)
			}
		}
		stmt.Close()
		tx.Commit()
	}

	// 5. Return Response
	c.JSON(http.StatusOK, gin.H{
		"score":        result.OverallScore,
		"violations":   violations,
		"content_json": result.ContentJSON, // Include for Visual Preview
		"stats": gin.H{
			"total":  result.TotalRules,
			"failed": result.FailedRules,
		},
	})
}
