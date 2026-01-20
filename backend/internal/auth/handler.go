package auth

import (
	"academic-check-sys/internal/database"
	"academic-check-sys/internal/models"
	"net/http"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
	FullName string `json:"full_name" binding:"required"`
	Role     string `json:"role" binding:"required,oneof=student teacher"` // Simple role selection for demo
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

func Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	user := models.User{
		Email:        req.Email,
		PasswordHash: string(hashedPassword),
		Role:         req.Role,
		FullName:     req.FullName,
		IsActive:     true,
	}

	// Raw SQL for now since we are not using full GORM features yet
	stmt, err := database.DB.Prepare("INSERT INTO users(email, password_hash, role, full_name, is_active) VALUES(?, ?, ?, ?, ?)")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	defer stmt.Close()

	_, err = stmt.Exec(user.Email, user.PasswordHash, user.Role, user.FullName, user.IsActive)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Email likely already exists"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "User registered successfully"})
}

func Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	row := database.DB.QueryRow("SELECT id, email, password_hash, role, full_name FROM users WHERE email = ?", req.Email)
	if err := row.Scan(&user.ID, &user.Email, &user.PasswordHash, &user.Role, &user.FullName); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	token, err := GenerateToken(user.ID, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	// SECURITY: Set HttpOnly Cookie
	// MaxAge: 3600*24 (1 day)
	// Path: "/"
	// Domain: "localhost" (or empty for current domain)
	// Secure: false (true if HTTPS)
	// HttpOnly: true (JS cannot access)
	c.SetCookie("access_token", token, 3600*24, "/", "", false, true)

	c.JSON(http.StatusOK, gin.H{
		"message": "Logged in successfully",
		"user": gin.H{
			"id":        user.ID,
			"full_name": user.FullName,
			"role":      user.Role,
		},
	})
}

func Logout(c *gin.Context) {
	// Clear cookie
	c.SetCookie("access_token", "", -1, "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{"message": "Logged out"})
}

func Me(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not logged in"})
		return
	}

	var user models.User
	row := database.DB.QueryRow("SELECT id, email, role, full_name FROM users WHERE id = ?", userID)
	if err := row.Scan(&user.ID, &user.Email, &user.Role, &user.FullName); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"user": gin.H{
			"id":        user.ID,
			"full_name": user.FullName,
			"role":      user.Role,
		},
	})
}
