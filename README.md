# DigitalDoc – Instant, Secure & Verified Academic Documents

DigitalDoc is a production-grade university document automation platform designed to streamline the issuance and verification of academic records. It provides a secure, end-to-end workflow for students to request documents, administrators to audit applications, and third parties to verify document authenticity via a cryptographic ledger.

## 🚀 Project Overview

The platform eliminates manual paperwork by digitizing the certificate issuance process. From the initial request to final generation, every step is recorded and validated against a simulated university ledger.

### 🔄 Core Workflow
1. **Authentication**: Students and Admins log in via a secure JWT-based gateway.
2. **Application**: Students select document types (Transcript, Marksheet, Certificate) and semester cycles.
3. **Payment**: The system generates a unique PSID and fee structure; students upload proof of payment.
4. **Audit**: Administrators review applications, counter-verify with banking records, and approve/reject.
5. **Issuance**: Upon approval, a secure digital document is generated with a cryptographic verification payload.
6. **Verification**: A public endpoint allows anyone to verify a document's validity using its unique PSID.

## ✨ Features

- **Secure Portals**: Distinct dashboards for Students and Administrators.
- **Role-Based Access Control (RBAC)**: Fine-grained permissions using JWT and FastAPI dependencies.
- **PSID Generation**: Unique identifier for every transaction to ensure traceability.
- **Audit Ledger**: Real-time activity logging for administrative oversight.
- **Cryptographic Verification**: Public validator to prevent academic fraud.
- **Responsive UI**: A modern, slate-themed interface optimized for mobile, tablet, and desktop devices.
- **Scalable Architecture**: Modular design allowing easy integration of real databases (Supabase/PostgreSQL) and payment gateways.

## 🛠 Technology Stack

- **Backend**: Python 3.9+, FastAPI, Pydantic, Uvicorn.
- **Security**: JWT (JSON Web Tokens), Passlib (Bcrypt hashing), Jose.
- **Frontend**: React 19, TypeScript, Tailwind CSS, FontAwesome.
- **Storage**: In-memory data structures (Ready for PostgreSQL/Supabase migration).

## 📋 Prerequisites

Before setting up DigitalDoc, ensure you have the following installed:
- **Python**: version 3.9 or higher
- **pip**: Python package manager
- **Node.js/npm**: (For frontend development, if running separately)

## ⚙️ Installation & Setup

Follow these steps to get your local development environment running:

### 1. Clone the Repository
```bash
git clone https://github.com/your-repo/digital-doc.git
cd digital-doc
```

### 2. Create a Virtual Environment
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install fastapi uvicorn python-jose[cryptography] passlib[bcrypt] pydantic[email] python-multipart
```

### 4. Configuration
Create a `.env` file in the root directory (the backend handles dummy defaults if not present):
```env
SECRET_KEY=digital_doc_ultra_secure_secret_782910
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

## 🏃 Running the App

Start the FastAPI server using Uvicorn:

```bash
python main.py
```
Alternatively:
```bash
uvicorn main:app --reload
```

- **API Base URL**: `http://localhost:8000`
- **Interactive Documentation (Swagger)**: `http://localhost:8000/docs`
- **Alternative Docs (Redoc)**: `http://localhost:8000/redoc`

## 📖 Usage

### Testing the Workflow
1. **Login**: Use the `/api/auth/login` endpoint or the frontend portal.
   - **Student**: `student@demo.com` / `password`
   - **Admin**: `admin@demo.com` / `password`
2. **Submit Request**: As a student, POST to `/api/student/request`.
3. **Upload Proof**: Use `/api/student/upload-payment/{id}` to simulate receipt submission.
4. **Approve**: As an admin, POST to `/api/admin/approve/{id}` to sign and generate the document.
5. **Verify**: Use the public GET `/api/verify/{psid}` to confirm the document is authentic.

## 📂 Project Structure

```text
├── main.py              # Application entry point & router integration
├── core/                # Security, JWT, and configuration logic
├── models/              # Pydantic schemas and in-memory database
├── routes/              # Modular API endpoints (Auth, Student, Admin, Verify)
├── services/            # (Placeholder) Business logic for PDF & Payments
├── components/          # Frontend React components (UI/UX)
├── types.ts             # TypeScript definitions for frontend
└── README.md            # Project documentation
```

## 📝 Notes & Future Integration

DigitalDoc currently uses **In-Memory Storage**. Data is reset when the server restarts. The following placeholders are ready for production services:
- **Database**: Replace `models/database.py` with SQLAlchemy or Supabase client.
- **PDF Service**: Integrate `ReportLab` or `WeasyPrint` for real PDF generation.
- **Payment Gateway**: Integrate Stripe or local banking APIs in `student_routes.py`.

## 📄 License

This project is open-source and available under the **MIT License**.

---
*Developed for DigitalDoc – Secure University Document Automation.*
