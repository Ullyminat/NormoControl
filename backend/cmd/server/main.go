package main

import (
	"academic-check-sys/internal/auth"
	"academic-check-sys/internal/database"
	"academic-check-sys/internal/handlers"

	"github.com/gin-gonic/gin"
)

func main() {
	// Initialize Database
	database.InitDB()

	r := gin.Default()
	// Increase Max Multipart Memory for uploads
	r.MaxMultipartMemory = 8 << 20 // 8 MiB

	// CORS Middleware
	r.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		// Allow any localhost origin
		if origin != "" {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			c.Writer.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		}

		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		// Add Authorization header
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

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
		{
			authGroup.POST("/register", auth.Register)
			authGroup.POST("/login", auth.Login)
			authGroup.POST("/logout", auth.Logout)

			// Secured Auth Routes
			authGroup.GET("/me", auth.AuthMiddleware(), auth.Me)
		}

		// Secured Routes
		secured := api.Group("/")
		secured.Use(auth.AuthMiddleware())
		{
			secured.POST("/check", handlers.UploadAndCheck)
			secured.GET("/standards", handlers.GetStandards)
			secured.POST("/standards", handlers.CreateStandard)
			secured.PUT("/standards/:id", handlers.UpdateStandard)
			secured.POST("/standards/extract", handlers.ExtractStandardFromDoc)
			secured.GET("/history", handlers.GetHistory)
			secured.GET("/history/:id", handlers.GetHistoryDetail)
			secured.GET("/teacher/history", handlers.GetTeacherHistory)
			secured.GET("/teacher/history/:id", handlers.GetTeacherHistoryDetail)
		}

		api.GET("/ping", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"message": "pong",
			})
		})
	}

	r.Run(":8090") // Changed from 8080 to 8090
}
