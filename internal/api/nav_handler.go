package api

import (
	"net/http"
	"strconv"

	"github.com/evalexp/home-nas-panel/internal/model"
	"github.com/evalexp/home-nas-panel/internal/service"

	"github.com/gin-gonic/gin"
)

type NavHandler struct {
	navSvc *service.NavService
}

func NewNavHandler(navSvc *service.NavService) *NavHandler {
	return &NavHandler{navSvc: navSvc}
}

func (h *NavHandler) List(c *gin.Context) {
	items, err := h.navSvc.ListItems()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *NavHandler) Create(c *gin.Context) {
	var item model.NavItem
	if err := c.ShouldBindJSON(&item); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if err := h.navSvc.CreateItem(&item); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, item)
}

func (h *NavHandler) Update(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 ID"})
		return
	}

	var item model.NavItem
	if err := c.ShouldBindJSON(&item); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	item.ID = uint(id)
	if err := h.navSvc.UpdateItem(&item); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, item)
}

func (h *NavHandler) Delete(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 ID"})
		return
	}

	if err := h.navSvc.DeleteItem(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "导航项已删除"})
}

// Reorder updates ordering and categories for a list of items
func (h *NavHandler) Reorder(c *gin.Context) {
	var req []service.ReorderItemReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的排序数据格式"})
		return
	}

	if err := h.navSvc.ReorderItems(req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新排序失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "排序已保存"})
}

// Icons library handlers

func (h *NavHandler) ListIcons(c *gin.Context) {
	icons, err := h.navSvc.ListIcons()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, icons)
}

func (h *NavHandler) CreateIcon(c *gin.Context) {
	var req struct {
		Name string `json:"name"`
		Data string `json:"data" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供图片数据 (data)"})
		return
	}

	name := req.Name
	if name == "" {
		name = "自定义图标"
	}

	icon := model.NavIcon{
		Name: name,
		Data: req.Data,
	}

	if err := h.navSvc.CreateIcon(&icon); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, icon)
}

func (h *NavHandler) DeleteIcon(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 ID"})
		return
	}

	if err := h.navSvc.DeleteIcon(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "图标已删除"})
}

// FetchIcon downloads an image from a URL and returns base64 Data URL for preview
func (h *NavHandler) FetchIcon(c *gin.Context) {
	var req struct {
		URL string `json:"url" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供有效的图标 URL"})
		return
	}

	res, err := h.navSvc.FetchIconFromURL(req.URL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, res)
}
