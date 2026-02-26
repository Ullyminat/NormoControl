package handlers

import (
	"academic-check-sys/internal/checker"
	"academic-check-sys/internal/database"
	"academic-check-sys/internal/models"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"

	"github.com/gin-gonic/gin"
)

func CreateStandard(c *gin.Context) {
	// Using generic map or struct for input binding for simplicity
	type CreateRequest struct {
		Name         string                    `json:"name" binding:"required"`
		Description  string                    `json:"description"`
		DocumentType string                    `json:"document_type" binding:"required"`
		Modules      []models.ValidationModule `json:"modules" binding:"required"`
	}

	var input CreateRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Assuming Auth Middleware sets user_id
	userID := c.GetUint("user_id")
	fmt.Printf("CreateStandard: Creating for UserID %d\n", userID)

	// Fetch User Name (Optional logging/debug, not needed for INSERT anymore)
	// We can keep specific logging if useful, but we won't insert the name.

	modulesBytes, _ := json.Marshal(input.Modules)
	modulesStr := string(modulesBytes)

	// Insert without AuthorName (it's normalized now), default is_public to TRUE
	res, err := database.DB.Exec("INSERT INTO formatting_standards (name, description, created_by, document_type, is_public, modules_json) VALUES (?, ?, ?, ?, ?, ?)",
		input.Name, input.Description, userID, input.DocumentType, true, modulesStr)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create standard: " + err.Error()})
		return
	}

	id, _ := res.LastInsertId()
	c.JSON(http.StatusCreated, gin.H{"id": id, "message": "Standard created"})
}

func UpdateStandard(c *gin.Context) {
	id := c.Param("id")
	userID := c.GetUint("user_id")

	type UpdateRequest struct {
		Name         string                    `json:"name" binding:"required"`
		Description  string                    `json:"description"`
		DocumentType string                    `json:"document_type" binding:"required"`
		Modules      []models.ValidationModule `json:"modules" binding:"required"`
	}

	var input UpdateRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify ownership before update
	var ownerID uint
	err := database.DB.QueryRow("SELECT created_by FROM formatting_standards WHERE id = ?", id).Scan(&ownerID)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Standard not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	if ownerID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only edit your own standards"})
		return
	}

	modulesBytes, _ := json.Marshal(input.Modules)
	modulesStr := string(modulesBytes)

	_, err = database.DB.Exec("UPDATE formatting_standards SET name=?, description=?, document_type=?, modules_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
		input.Name, input.Description, input.DocumentType, modulesStr, id)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update standard"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Standard updated"})
}

func GetStandards(c *gin.Context) {
	// 1. Get Current User ID
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	// 2. Get User Role from Context (Set by AuthMiddleware)
	roleAny, exists := c.Get("role")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Role not found in token"})
		return
	}
	role := roleAny.(string)

	// 3. Prepare Query based on Role
	// using explicit column names is safer
	baseQuery := `
		SELECT 
			fs.id, 
			fs.name, 
			fs.description, 
			fs.document_type, 
			fs.is_public,
            fs.modules_json,
			fs.created_at, 
			u.full_name as author_real_name,
			u.email as author_email
		FROM formatting_standards fs
		LEFT JOIN users u ON fs.created_by = u.id
	`

	var rows *sql.Rows
	var qErr error

	if role == "teacher" {
		// Teachers see ONLY their own standards
		query := baseQuery + " WHERE fs.created_by = ? ORDER BY fs.created_at DESC"
		rows, qErr = database.DB.Query(query, userID)
	} else if role == "student" {
		// Students see ONLY public standards
		query := baseQuery + " WHERE fs.is_public = 1 ORDER BY fs.created_at DESC"
		rows, qErr = database.DB.Query(query)
	} else {
		// Admins or others see ALL
		query := baseQuery + " ORDER BY fs.created_at DESC"
		rows, qErr = database.DB.Query(query)
	}

	if qErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error: " + qErr.Error()})
		return
	}
	defer rows.Close()

	var standards []gin.H
	for rows.Next() {
		var id uint
		var name, description, docType, modulesJSON string
		var isPublic bool
		var authorNameStr, authorEmailStr sql.NullString
		var createdAt interface{}

		if err := rows.Scan(&id, &name, &description, &docType, &isPublic, &modulesJSON, &createdAt, &authorNameStr, &authorEmailStr); err != nil {
			fmt.Println("Scan error:", err)
			continue
		}

		// Resolve Author Name
		authorName := "Система"
		if authorNameStr.Valid && authorNameStr.String != "" {
			authorName = authorNameStr.String
		} else if authorEmailStr.Valid && authorEmailStr.String != "" {
			authorName = authorEmailStr.String
		}

		var modules []models.ValidationModule
		if modulesJSON != "" {
			json.Unmarshal([]byte(modulesJSON), &modules)
		}

		standards = append(standards, gin.H{
			"id":            id,
			"name":          name,
			"description":   description,
			"document_type": docType,
			"modules":       modules,
			"is_public":     isPublic,
			"created_at":    createdAt,
			"author_name":   authorName,
		})
	}

	// Return empty list instead of null if empty
	if standards == nil {
		standards = []gin.H{}
	}

	c.JSON(http.StatusOK, standards)
}

func ExtractStandardFromDoc(c *gin.Context) {
	file, err := c.FormFile("document")
	if err != nil {
		c.JSON(400, gin.H{"error": "No file uploaded"})
		return
	}

	tempPath := filepath.Join("./uploads", "temp_template_"+file.Filename)
	if err := c.SaveUploadedFile(file, tempPath); err != nil {
		c.JSON(500, gin.H{"error": "Failed to save file"})
		return
	}

	parser := checker.NewDocParser()
	doc, err := parser.Parse(tempPath)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to parse DOCX: " + err.Error()})
		return
	}

	config := doc.ExtractConfig()

	c.JSON(200, gin.H{
		"config":  config,
		"message": "Standard extracted successfully",
	})
}

func DeleteStandard(c *gin.Context) {
	id := c.Param("id")

	// Get user ID and role for permission check
	userID := c.GetUint("user_id")
	roleAny, _ := c.Get("role")
	role := roleAny.(string)

	// Check standard existence and creator
	var creatorID uint
	err := database.DB.QueryRow("SELECT created_by FROM formatting_standards WHERE id = ?", id).Scan(&creatorID)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Standard not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// Permission logic: Admin can delete anything. Creator can delete their own.
	if role != "admin" && creatorID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Permission denied"})
		return
	}

	_, err = database.DB.Exec("DELETE FROM formatting_standards WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete standard"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Standard deleted successfully"})
}
