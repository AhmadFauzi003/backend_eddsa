# Sistem Tanda Tangan Digital EdDSA Multi-Signature dengan QR Code

**Implementasi sistem tanda tangan digital berbasis algoritma EdDSA dengan skema multi-signature untuk verifikasi dokumen akademik menggunakan QR Code dinamis.**

## 📋 Deskripsi Proyek

Sistem ini merupakan implementasi dari penelitian skripsi "**Integrasi Algoritma EdDSA dengan Multi-Signature pada Sistem Tanda Tangan Digital berbasis QR Code untuk Verifikasi Dokumen Akademik**" oleh Ahmad Fauzi Saifuddin (105841102021) dari Program Studi Informatika, Universitas Muhammadiyah Makassar.

### Fitur Utama

- ✅ **EdDSA (Ed25519) Signature**: Implementasi algoritma tanda tangan digital modern yang efisien dan aman
- ✅ **Multi-Signature Support**: Sistem yang mendukung beberapa penandatangan pada satu dokumen
- ✅ **QR Code Integration**: QR Code dinamis untuk verifikasi dokumen yang mudah dan cepat
- ✅ **Document Management**: CRUD operations untuk dokumen akademik
- ✅ **Signature Verification**: Verifikasi otomatis tanda tangan digital
- ✅ **RESTful API**: API yang lengkap dan mudah digunakan

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 atau lebih baru)
- npm atau yarn
- Editor teks (VS Code disarankan)

### Instalasi

1. **Clone atau buat direktori project**
```bash
mkdir eddsa-multisig-system
cd eddsa-multisig-system
```

2. **Inisialisasi project dan install dependencies**
```bash
npm init -y
npm install express cors helmet morgan multer tweetnacl qrcode crypto moment uuid joi bcrypt jsonwebtoken node-forge
npm install --save-dev nodemon jest supertest
```

3. **Buat struktur direktori**
```bash
mkdir -p config services routes middleware uploads public logs
```

4. **Copy semua file code yang telah dibuat ke dalam struktur direktori yang sesuai**

5. **Update package.json dengan scripts yang tepat**

6. **Jalankan server**
```bash
# Development mode
npm run dev

# Production mode
npm start
```

Server akan berjalan di `http://localhost:3000`

## 📁 Struktur Project

```
eddsa-multisig-system/
├── config/
│   └── config.js              # Konfigurasi aplikasi
├── services/
│   ├── eddsaService.js        # Service untuk EdDSA operations
│   ├── multiSignatureService.js # Service untuk multi-signature
│   └── qrCodeService.js       # Service untuk QR Code generation
├── routes/
│   ├── documentRoutes.js      # API routes untuk dokumen
│   ├── signatureRoutes.js     # API routes untuk signature
│   ├── verificationRoutes.js  # API routes untuk verifikasi
│   └── keyRoutes.js           # API routes untuk key management
├── middleware/
│   ├── errorHandler.js        # Error handling middleware
│   └── rateLimiter.js         # Rate limiting middleware
├── uploads/                   # Directory untuk file upload
├── public/                    # Static files
├── logs/                      # Log files
├── server.js                  # Main server file
├── package.json               # Dependencies dan scripts
└── README.md                  # Dokumentasi ini
```

## 🔧 API Endpoints

### Documents
- `GET /api/documents` - Mendapatkan semua dokumen
- `POST /api/documents` - Membuat dokumen baru
- `GET /api/documents/:id` - Mendapatkan dokumen specific
- `PUT /api/documents/:id` - Update dokumen
- `DELETE /api/documents/:id` - Hapus dokumen
- `POST /api/documents/:id/prepare-signing` - Prepare untuk multi-signature
- `GET /api/documents/:id/qr-code` - Generate QR code untuk dokumen

### Signatures
- `POST /api/signatures/single` - Buat single signature
- `POST /api/signatures/multi/:sessionId/:role` - Tambah signature ke multi-sig session
- `GET /api/signatures/session/:sessionId` - Info session multi-signature
- `GET /api/signatures/session/:sessionId/qr/:role` - QR code untuk signing
- `GET /api/signatures/:documentId` - Dapatkan signature dokumen
- `POST /api/signatures/verify` - Verifikasi signature

### Verification
- `POST /api/verification/qr` - Verifikasi menggunakan QR code
- `GET /api/verification/:verificationId` - Dapatkan data verifikasi
- `POST /api/verification/document/:documentId` - Verifikasi dokumen langsung
- `GET /api/verification/report/:verificationId` - Generate verification report
- `POST /api/verification/batch` - Batch verification

### Key Management
- `POST /api/keys/generate` - Generate key pair baru
- `GET /api/keys/:keyId` - Info public key
- `GET /api/keys` - Semua public keys
- `POST /api/keys/validate` - Validasi key pair
- `POST /api/keys/:keyId/revoke` - Revoke key
- `GET /api/keys/algorithm/info` - Info algoritma

## 📝 Contoh Penggunaan

### 1. Generate Key Pair untuk Signer

```javascript
const response = await fetch('http://localhost:3000/api/keys/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        signerInfo: {
            role: 'dosen',
            name: 'Dr. John Doe',
            email: 'john.doe@university.ac.id'
        }
    })
});
const keyData = await response.json();
console.log('Key ID:', keyData.data.keyId);
```

### 2. Buat Dokumen Baru

```javascript
const formData = new FormData();
formData.append('title', 'Transkrip Nilai Ahmad Fauzi Saifuddin');
formData.append('type', 'transkrip');
formData.append('recipient', 'Ahmad Fauzi Saifuddin');
formData.append('issuer', 'Universitas Muhammadiyah Makassar');

const response = await fetch('http://localhost:3000/api/documents', {
    method: 'POST',
    body: formData
});
```

### 3. Setup Multi-Signature

```javascript
const response = await fetch(`http://localhost:3000/api/documents/${documentId}/prepare-signing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        signers: [
            { role: 'dosen', name: 'Dr. Lukman', email: 'lukman@unismuh.ac.id', required: true },
            { role: 'kaprodi', name: 'Dr. Muhyiddin AM Hayat', email: 'hayat@unismuh.ac.id', required: true },
            { role: 'dekan', name: 'Dr. Muh. Syafaat S Kuba', email: 'syafaat@unismuh.ac.id', required: true }
        ],
        threshold: 2
    })
});
```

### 4. Tambah Signature ke Multi-Signature Session

```javascript
const response = await fetch(`http://localhost:3000/api/signatures/multi/${sessionId}/dosen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        signerInfo: {
            role: 'dosen',
            name: 'Dr. Lukman',
            email: 'lukman@unismuh.ac.id'
        },
        privateKey: 'base64-encoded-private-key'
    })
});
```

### 5. Generate QR Code untuk Dokumen

```javascript
const response = await fetch(`http://localhost:3000/api/documents/${documentId}/qr-code`);
const qrData = await response.json();
// qrData.data.qrImage contains base64 encoded QR image
```

### 6. Verifikasi Dokumen via QR Code

```javascript
const response = await fetch('http://localhost:3000/api/verification/qr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        qrData: 'scanned-qr-data-here'
    })
});
const verification = await response.json();
console.log('Valid:', verification.data.verification.valid);
```

## 🛠️ Development

### Running Tests

```bash
npm test
```

### Linting dan Code Quality

```bash
# Install ESLint (optional)
npm install --save-dev eslint
npx eslint . --init
```

### Environment Variables

Buat file `.env` untuk konfigurasi environment:

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=your-super-secret-key-here
LOG_LEVEL=info
```

## 🔐 Keamanan

### Poin Penting Keamanan:

1. **Private Key Storage**: Dalam implementasi produksi, simpan private key dengan enkripsi yang kuat
2. **Authentication**: Implementasikan sistem autentikasi yang proper untuk akses API sensitif
3. **Rate Limiting**: Sudah diimplementasikan untuk mencegah abuse
4. **Input Validation**: Validasi input menggunakan Joi atau library similar
5. **HTTPS**: Gunakan HTTPS di production
6. **Database Security**: Enkripsi data sensitif di database

## 📊 Monitoring dan Logging

System menggunakan Morgan untuk HTTP request logging dan menyediakan:
- Request/response logging
- Error logging dengan stack trace
- Performance metrics
- Health check endpoint di `/health`

## 🧪 Testing

Contoh test dengan Jest dan Supertest:

```javascript
const request = require('supertest');
const app = require('./server');

describe('Document API', () => {
    test('Should create new document', async () => {
        const response = await request(app)
            .post('/api/documents')
            .send({
                title: 'Test Document',
                type: 'surat_keterangan',
                recipient: 'Test User'
            });
        
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
    });
});
```

## 🤝 Contributing

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 👨‍🎓 Author

**Ahmad Fauzi Saifuddin**
- Student ID: 105841102021
- Program: Informatika, Fakultas Teknik
- University: Universitas Muhammadiyah Makassar
- Year: 2025

## 📚 References

1. Wellem, T., Nataliani, Y., & Iriani, A. (2022). Academic Document Authentication using Elliptic Curve Digital Signature Algorithm and QR Code
2. Yuliana, M., & Walidaniy, W. D. (2024). Efficient Multi-signature and QR Code Integration for Document Authentication Using EdDSA-based Algorithm
3. Bernstein, D. J., et al. (2012). High-speed high-security signatures
4. RFC 8032 - Edwards-Curve Digital Signature Algorithm (EdDSA)

---

**© 2025 Ahmad Fauzi Saifuddin - Universitas Muhammadiyah Makassar**#   b a c k e n d _ e d d s a  
 