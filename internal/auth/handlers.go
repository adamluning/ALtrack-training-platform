package auth

import (
	"train-platform/internal/db"

	"github.com/gin-gonic/gin"

	"regexp"
	"strings"
)

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

type Handler struct {
	Repo *Repository
}

func NewHandler() *Handler {
	return &Handler{
		Repo: &Repository{DB: db.DB},
	}
}

func (h *Handler) Register(c *gin.Context) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := c.BindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid input"})
		return
	}

	req.Email = strings.ToLower(req.Email)

	if !emailRegex.MatchString(req.Email) {
		c.JSON(400, gin.H{"error": "invalid email"})
		return
	}

	if len(req.Password) < 8 {
		c.JSON(400, gin.H{"error": "password must be at least 8 characters"})
		return
	}
	if len(req.Password) > 72 {
		c.JSON(400, gin.H{"error": "password must be at most 72 characters"})
		return
	}

	hash, err := HashPassword(req.Password)
	if err != nil {
		c.JSON(500, gin.H{"error": "hash failed"})
		return
	}

	id, err := h.Repo.CreateUser(req.Email, hash)
	if err != nil {
		c.JSON(400, gin.H{"error": "user exists"})
		return
	}

	token, _ := GenerateToken(id, req.Email)

	c.JSON(200, gin.H{"token": token})
}

func (h *Handler) Login(c *gin.Context) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := c.BindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid input"})
		return
	}

	req.Email = strings.ToLower(req.Email)

	if !emailRegex.MatchString(req.Email) {
		c.JSON(400, gin.H{"error": "invalid email format"})
		return
	}

	user, err := h.Repo.GetUserByEmail(req.Email)
	if err != nil {
		c.JSON(401, gin.H{"error": "invalid credentials"})
		return
	}

	if !CheckPassword(req.Password, user.PasswordHash) {
		c.JSON(401, gin.H{"error": "incorrect password"})
		return
	}

	token, _ := GenerateToken(user.ID, req.Email)

	c.JSON(200, gin.H{"token": token})
}