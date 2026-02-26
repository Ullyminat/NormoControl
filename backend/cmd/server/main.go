package main

import (
	"academic-check-sys/internal/auth"
	"academic-check-sys/internal/database"
	"academic-check-sys/internal/handlers"
	"academic-check-sys/internal/middleware"
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
	// Load environment variables (ignore error if .env is missing, it might be set in OS)
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, relying on system environment variables")
	}

	// Initialize Database
	database.InitDB()

	r := gin.Default()
	// Increase Max Multipart Memory for uploads
	r.MaxMultipartMemory = 8 << 20 // 8 MiB

	// Initialize Rate Limiters
	// Global: 50 req/sec, burst of 100
	globalLimiter := middleware.NewIPRateLimiter(50, 100)
	// Auth routes (Login/Register): 2 req/sec, burst of 5 (Anti-Bruteforce)
	authLimiter := middleware.NewIPRateLimiter(2, 5)

	// Apply Global Rate Limiting
	r.Use(middleware.RateLimitMiddleware(globalLimiter))

	// Security Headers & CORS Middleware
	r.Use(func(c *gin.Context) {
		allowedOrigin := os.Getenv("ALLOWED_ORIGIN")
		if allowedOrigin == "" {
			allowedOrigin = "http://localhost:5173" // Default fail-safe
		}

		origin := c.Request.Header.Get("Origin")

		// STRICT CORS: Only allow the exact origin specified, no dynamic reflection
		if origin == allowedOrigin {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		}

		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		// Security Headers (OWASP Recommended)
		c.Writer.Header().Set("X-Content-Type-Options", "nosniff")
		c.Writer.Header().Set("X-Frame-Options", "DENY")
		c.Writer.Header().Set("X-XSS-Protection", "1; mode=block")
		c.Writer.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	api := r.Group("/api")
	{
		// Serve Static Uploads (for PDFs)
		api.Static("/uploads", "./uploads")

		authGroup := api.Group("/auth")
		authGroup.Use(middleware.RateLimitMiddleware(authLimiter)) // Strict rate limit for auth
		{
			authGroup.POST("/register", auth.Register)
			authGroup.POST("/login", auth.Login)
			authGroup.POST("/logout", auth.Logout)

			// Secured Auth Routes
			authGroup.GET("/me", auth.AuthMiddleware(), auth.Me)
		}

		// Secured Routes (Require Login)
		secured := api.Group("/")
		secured.Use(auth.AuthMiddleware())
		{
			// Student / Shared Routes
			secured.POST("/check", handlers.UploadAndCheck)
			secured.GET("/standards", handlers.GetStandards)
			secured.GET("/history", handlers.GetHistory)
			secured.GET("/history/:id", handlers.GetHistoryDetail)

			// Teacher & Admin Routes (Mutating Standards & Teacher History)
			teacherRoutes := secured.Group("/")
			teacherRoutes.Use(auth.RequireRole("teacher", "admin"))
			{
				teacherRoutes.POST("/standards", handlers.CreateStandard)
				teacherRoutes.PUT("/standards/:id", handlers.UpdateStandard)
				teacherRoutes.DELETE("/standards/:id", handlers.DeleteStandard)
				teacherRoutes.POST("/standards/extract", handlers.ExtractStandardFromDoc)
				teacherRoutes.GET("/teacher/history", handlers.GetTeacherHistory)
				teacherRoutes.GET("/teacher/history/:id", handlers.GetTeacherHistoryDetail)
			}

			// Admin Only Routes
			adminGroup := secured.Group("/admin")
			adminGroup.Use(auth.RequireRole("admin"))
			{
				adminGroup.GET("/stats", handlers.GetAdminStats)
				adminGroup.GET("/users", handlers.GetUsers)
				adminGroup.DELETE("/users/:id", handlers.DeleteUser)
				adminGroup.PUT("/users/:id/status", handlers.ToggleUserStatus)
			}
		}

		api.GET("/ping", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"message": "pong",
			})
		})

		// Prometheus Metrics Endpoint
		api.GET("/metrics", gin.WrapH(promhttp.Handler()))
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8090"
	}
	r.Run(":" + port)
}
