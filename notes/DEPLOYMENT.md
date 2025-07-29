# File Server Deployment Guide

A modern file server with enhanced sharing capabilities, featuring specialized pages for different file types.

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Git
- (Optional) Node.js 20+ & pnpm for local development

### 1. Clone and Setup
```bash
git clone <repository-url>
cd file-server
cp env.example .env
# Edit .env with your configuration
```

### 2. Build and Deploy
```bash
# Development deployment
./build.sh dev

# Production deployment  
./build.sh prod
```

### 3. Access Application
- **Main App**: http://localhost:8090
- **Health Check**: http://localhost:8090/health
- **API Documentation**: http://localhost:8090/api/docs

## 📁 New Share Page Features

The file server now automatically routes different file types to specialized sharing pages:

### 🎥 Media Files (`/s/{shareId}`)
**Supported formats**: MP4, AVI, MOV, MP3, WAV, FLAC, etc.

**Features**:
- Custom video/audio player with full controls
- Playback speed control (0.5x - 2x)
- Picture-in-picture mode for videos
- Fullscreen support
- Volume control and seeking
- Auto-hiding controls for videos
- Beautiful audio visualization

**Example**: Video files automatically load in a dark-themed media player with professional controls.

### 📄 PDF Files (`/s/{shareId}`)
**Supported formats**: PDF

**Features**:
- Browser-native PDF preview
- Page navigation controls
- Zoom controls (25% - 300%)
- Rotation support
- Download fallback for unsupported browsers
- Mobile-responsive viewer

**Example**: PDF files open in a document viewer with navigation toolbar.

### 📊 Office Documents (`/s/{shareId}`)
**Supported formats**: DOC, DOCX, XLS, XLSX, PPT, PPTX, ODT, ODS, ODP

**Features**:
- KKFileView integration UI (ready for backend setup)
- File type-specific icons and descriptions
- Download fallback
- Configuration instructions for KKFileView service

**Example**: Office documents show a preview interface with download option.

### 📦 Download Pages (`/s/{shareId}`)
**Supported formats**: ZIP, RAR, EXE, DMG, and other binary files

**Features**:
- Secure download confirmation
- File type warnings (especially for executables)
- File information display
- Safety reminders for executable files
- Clear download instructions

**Example**: Executable files show security warnings before download.

### 📝 Text/Code Files (`/s/{shareId}`)
**Supported formats**: MD, TXT, JS, Python, HTML, CSS, etc.

**Features** (Original functionality enhanced):
- Markdown rendering with table of contents
- AI-powered content summaries
- Syntax highlighting for code files
- Copy and download options
- Mobile-responsive design

## 🛠️ Configuration

### Environment Variables (.env)
```bash
# Authentication
AUTH_TOKEN=your-secret-token

# File storage
FILE_STORAGE_PATH=storage
MAX_FILE_SIZE_MB=5000

# LLM API (for AI features)
LLM_API_KEY=your-llm-api-key
LLM_BASE_URL=https://api.your-llm-provider.com/v1

# File transfer settings
UPLOAD_CHUNK_SIZE_MB=4
DOWNLOAD_CHUNK_SIZE_MB=4
```

### Docker Compose Configurations

#### Deployment (`docker-compose.yml`)
- Exposes port 8090


## 🔗 API Usage

### Create Share Links
```bash
# Create a share link
curl -X POST "http://localhost:8090/api/share" \
  -d "filename=example.mp4" \
  -d "is_public=true" \
  -d "token=your-secret-token"

# Response
{
  "success": true,
  "share_id": "uuid-here",
  "share_url": "/s/uuid-here",
  "filename": "example.mp4",
  "is_public": true,
  "created_at": "2024-01-01T12:00:00"
}
```

### Access Shared Files
- **Share URL**: `http://localhost:8090/s/{share_id}`
- **Direct API**: `http://localhost:8090/api/s/{share_id}`
- **Share Info**: `http://localhost:8090/api/share/info/{share_id}`



### Frontend (React + TypeScript)
- **Share Router** (`ShareRouter.tsx`): Routes to appropriate share page
- **Media Player** (`MediaSharePage.tsx`): Video/audio playback
- **PDF Viewer** (`PdfSharePage.tsx`): Document preview
- **Office Docs** (`OfficeSharePage.tsx`): Office document handling
- **Download Pages** (`DownloadSharePage.tsx`): Secure download flow
- **Text Viewer** (`ShareViewPage.tsx`): Enhanced text/markdown display

### Backend (FastAPI + Python)
- **Share Manager** (`share_manager.py`): Share link creation and management
- **File Type Detection** (`fileExtensions.ts`): Automatic file categorization
- **Route Handling** (`routes.py`): API endpoints for sharing

### Infrastructure
- **Nginx**: Reverse proxy and static file serving
- **Docker**: Containerized deployment
- **Supervisor**: Process management

## 🔒 Security Features

### File Access Control
- Token-based authentication for private files
- Share-specific access (no direct file access required)
- Public/private file distinction

### Executable File Warnings
- Security warnings for .exe, .dmg, .msi files
- Clear safety instructions
- User confirmation required

### Network Security
- Nginx proxy for API isolation
- Health check endpoints
- Proper CORS handling

## 🚨 Troubleshooting

### Common Issues

#### Share Page Not Loading
```bash
# Check container status
docker-compose ps

# Check logs
docker-compose logs -f

# Verify health
curl http://localhost:8090/health
```

#### File Type Not Detected
- Verify file extension in `fileExtensions.ts`
- Check `getFileType()` function logic
- Ensure proper MIME type detection

#### Media Player Issues
- Check browser compatibility (modern browsers required)
- Verify video/audio codec support
- Test with different file formats

#### PDF Viewer Not Working
- Ensure browser supports PDF preview
- Check for CORS issues
- Test download fallback

### Docker Issues
```bash
# Rebuild from scratch
docker-compose down
docker system prune -f


# Check resource usage
docker stats

# Inspect container
docker-compose exec app bash
```

## 📈 Performance Optimization

### Client-Side
- Lazy loading for large files
- Progressive enhancement
- Chunked file transfers
- Efficient media streaming

### Server-Side
- Nginx caching for static assets
- Gzip compression
- Health check optimization
- Resource limits in production

### Database
- Share information stored in JSON file
- Efficient file metadata caching
- Minimal database queries

## 🔮 Future Enhancements

### Planned Features
- [ ] KKFileView integration for office documents
- [ ] Enhanced PDF annotation tools
- [ ] Video/audio transcription
- [ ] File preview thumbnails
- [ ] Advanced sharing permissions
- [ ] SSL/HTTPS support
- [ ] Cloud storage integration

### Integration Options
- **KKFileView**: For office document preview
- **PDF.js**: Enhanced PDF rendering
- **Video.js**: Advanced video player
- **Monaco Editor**: Code file editing

## 📋 Maintenance

### Regular Tasks
- Monitor disk usage in storage directory
- Review share links and clean expired ones
- Update dependencies and security patches
- Backup configuration and data

### Monitoring
- Health check endpoint: `/health`
- Application logs: `docker-compose logs`
- Resource usage: `docker stats`
- Share statistics via API

---

For detailed technical documentation, see the inline code comments and API documentation at `/api/docs` when the server is running.