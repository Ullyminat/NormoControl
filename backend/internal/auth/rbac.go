package auth

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// RequireRole enforces that the user has at least one of the allowed roles.
// Must be used AFTER AuthMiddleware.
func RequireRole(allowedRoles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// role is set by AuthMiddleware
		userRole, exists := c.Get("role")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized (Role not found)"})
			c.Abort()
			return
		}

		roleStr, ok := userRole.(string)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error: Invalid role format"})
			c.Abort()
			return
		}

		// Check if user's role is in the allowed list
		isAllowed := false
		for _, allowedRole := range allowedRoles {
			if roleStr == allowedRole {
				isAllowed = true
				break
			}
		}

		if !isAllowed {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "У вас нет прав для выполнения этого действия", // Access Denied
			})
			c.Abort()
			return
		}

		c.Next()
	}
}
