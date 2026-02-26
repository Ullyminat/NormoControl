package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// IPRateLimiter stores rate limiters for each IP address
type IPRateLimiter struct {
	ips map[string]*rate.Limiter
	mu  *sync.RWMutex
	r   rate.Limit
	b   int
}

// NewIPRateLimiter creates a new limiter instance
func NewIPRateLimiter(r rate.Limit, b int) *IPRateLimiter {
	i := &IPRateLimiter{
		ips: make(map[string]*rate.Limiter),
		mu:  &sync.RWMutex{},
		r:   r,
		b:   b,
	}

	// Cleanup stale IPs periodically
	go i.cleanupStaleIPs()
	return i
}

// GetLimiter returns the rate limiter for a specific IP. If it doesn't exist, it creates one.
func (i *IPRateLimiter) GetLimiter(ip string) *rate.Limiter {
	i.mu.Lock()
	defer i.mu.Unlock()

	limiter, exists := i.ips[ip]
	if !exists {
		limiter = rate.NewLimiter(i.r, i.b)
		i.ips[ip] = limiter
	}

	return limiter
}

// RateLimitMiddleware is a Gin middleware that enforces the IP rate limit
func RateLimitMiddleware(limiter *IPRateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		limiterForIP := limiter.GetLimiter(ip)

		if !limiterForIP.Allow() {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Трошки медленнее! Слишком много запросов (Rate Limit Exceeded)",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// cleanupStaleIPs clears the map every hour to prevent memory leaks from one-off IPs
func (i *IPRateLimiter) cleanupStaleIPs() {
	for {
		time.Sleep(1 * time.Hour)
		i.mu.Lock()
		// Simple approach: reset the map entirely and let it rebuild
		i.ips = make(map[string]*rate.Limiter)
		i.mu.Unlock()
	}
}
