package service

import (
	"crypto/tls"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/evalexp/home-nas-panel/internal/db"
	"github.com/evalexp/home-nas-panel/internal/model"
	"gorm.io/gorm"
)

type NavService struct{}

func NewNavService() *NavService {
	return &NavService{}
}

// ListItems returns all nav items with their associated custom icons preloaded
func (s *NavService) ListItems() ([]model.NavItem, error) {
	var items []model.NavItem
	err := db.DB.Preload("CustomIcon").Order("order_index asc, id asc").Find(&items).Error
	return items, err
}

func (s *NavService) CreateItem(item *model.NavItem) error {
	if item.OrderIndex <= 0 {
		var maxOrder int
		db.DB.Model(&model.NavItem{}).Select("COALESCE(MAX(order_index), 0)").Scan(&maxOrder)
		item.OrderIndex = maxOrder + 1
	}
	return db.DB.Create(item).Error
}

func (s *NavService) UpdateItem(item *model.NavItem) error {
	fields := []string{"Title", "URL", "Icon", "IconID", "Category", "Description"}
	if item.OrderIndex > 0 {
		fields = append(fields, "OrderIndex")
	}
	return db.DB.Model(&model.NavItem{ID: item.ID}).
		Select(fields).
		Updates(item).Error
}

func (s *NavService) DeleteItem(id uint) error {
	return db.DB.Delete(&model.NavItem{}, id).Error
}

type ReorderItemReq struct {
	ID         uint   `json:"id" binding:"required"`
	Category   string `json:"category"`
	OrderIndex int    `json:"orderIndex"`
}

// ReorderItems updates category and orderIndex for multiple nav items in a single transaction
func (s *NavService) ReorderItems(reqs []ReorderItemReq) error {
	return db.DB.Transaction(func(tx *gorm.DB) error {
		for _, r := range reqs {
			updates := map[string]interface{}{
				"order_index": r.OrderIndex,
			}
			if r.Category != "" {
				updates["category"] = r.Category
			}
			if err := tx.Model(&model.NavItem{}).Where("id = ?", r.ID).Updates(updates).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// Custom Icons management

func (s *NavService) ListIcons() ([]model.NavIcon, error) {
	var icons []model.NavIcon
	err := db.DB.Order("id desc").Find(&icons).Error
	return icons, err
}

func (s *NavService) CreateIcon(icon *model.NavIcon) error {
	return db.DB.Create(icon).Error
}

func (s *NavService) DeleteIcon(id uint) error {
	// Unlink any nav items using this icon
	db.DB.Model(&model.NavItem{}).Where("icon_id = ?", id).Update("icon_id", nil)
	return db.DB.Delete(&model.NavIcon{}, id).Error
}

type FetchIconResult struct {
	Data     string `json:"data"`
	MimeType string `json:"mimeType"`
	Size     int64  `json:"size"`
	Filename string `json:"filename"`
}

// FetchIconFromURL downloads an image from a URL and returns a Data URL with metadata for preview
func (s *NavService) FetchIconFromURL(rawURL string) (*FetchIconResult, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return nil, errors.New("图标 URL 不能为空")
	}

	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, errors.New("无效的 URL 地址，必须以 http:// 或 https:// 开头")
	}

	client := &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	req, err := http.NewRequest("GET", rawURL, nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; HomeNASPanel/1.0; +https://github.com/evalexp/home-nas-panel)")
	req.Header.Set("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("下载图标失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("下载图标失败，HTTP 状态码: %d", resp.StatusCode)
	}

	// Max 5MB
	const maxBytes = 5 * 1024 * 1024
	lr := io.LimitReader(resp.Body, maxBytes+1)
	bodyBytes, err := io.ReadAll(lr)
	if err != nil {
		return nil, fmt.Errorf("读取图片内容失败: %w", err)
	}
	if len(bodyBytes) > maxBytes {
		return nil, errors.New("图片大小超过上限 (最大允许 5MB)")
	}
	if len(bodyBytes) == 0 {
		return nil, errors.New("下载的文件为空")
	}

	// Detect MIME type
	ct := resp.Header.Get("Content-Type")
	mimeType := strings.ToLower(strings.TrimSpace(strings.Split(ct, ";")[0]))

	cleanPath := strings.ToLower(u.Path)
	if mimeType == "" || mimeType == "application/octet-stream" || mimeType == "text/plain" {
		switch {
		case strings.HasSuffix(cleanPath, ".svg"):
			mimeType = "image/svg+xml"
		case strings.HasSuffix(cleanPath, ".ico"):
			mimeType = "image/x-icon"
		case strings.HasSuffix(cleanPath, ".png"):
			mimeType = "image/png"
		case strings.HasSuffix(cleanPath, ".webp"):
			mimeType = "image/webp"
		case strings.HasSuffix(cleanPath, ".jpg"), strings.HasSuffix(cleanPath, ".jpeg"):
			mimeType = "image/jpeg"
		default:
			detected := http.DetectContentType(bodyBytes)
			if strings.HasPrefix(detected, "image/") {
				mimeType = detected
			}
		}
	}

	snippetLen := len(bodyBytes)
	if snippetLen > 512 {
		snippetLen = 512
	}
	trimmedBody := strings.TrimSpace(string(bodyBytes[:snippetLen]))
	if strings.HasPrefix(trimmedBody, "<svg") || (strings.HasPrefix(trimmedBody, "<?xml") && strings.Contains(trimmedBody, "<svg")) {
		mimeType = "image/svg+xml"
	}

	if !strings.HasPrefix(mimeType, "image/") && mimeType != "image/svg+xml" && mimeType != "image/x-icon" && mimeType != "image/vnd.microsoft.icon" {
		if strings.Contains(mimeType, "html") {
			return nil, errors.New("目标地址返回的是网页而非图片，请提供直接的图标/图片文件 URL")
		}
		return nil, fmt.Errorf("不支持的文件格式 (%s)，请提供有效的图片链接", mimeType)
	}

	// Suggest filename
	filename := path.Base(u.Path)
	if ext := path.Ext(filename); ext != "" {
		filename = strings.TrimSuffix(filename, ext)
	}
	if filename == "" || filename == "/" || filename == "." {
		filename = "网络图标"
	}

	dataURL := fmt.Sprintf("data:%s;base64,%s", mimeType, base64.StdEncoding.EncodeToString(bodyBytes))

	return &FetchIconResult{
		Data:     dataURL,
		MimeType: mimeType,
		Size:     int64(len(bodyBytes)),
		Filename: filename,
	}, nil
}
