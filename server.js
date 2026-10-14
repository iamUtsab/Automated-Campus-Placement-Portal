const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const Student = require('./models/Student');
const Job = require('./models/Job');
const Application = require('./models/Application');
const Resource = require('./models/Resource');

const app = express();
const PORT = 5000;
const JWT_SECRET = 'super_secret_placement_key_2026';

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads folder exists
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// ==========================================
// 1. FILE UPLOAD CONFIGURATION (MULTER)
// ==========================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Only PDF resumes are allowed!'), false);
    }
});

// ==========================================
// 2. EMAIL NOTIFICATION SERVICE (GMAIL SMTP)
// ==========================================

// ⚠️ REPLACE WITH YOUR REAL GMAIL CREDENTIALS
const GMAIL_USER = 'yourcollegeemail@gmail.com'; 
const GMAIL_APP_PASS = 'abcd efgh ijkl mnop'; // 16-character Google App Password

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASS
    }
});

async function sendEmailNotification(to, subject, text) {
    // Skip if credentials aren't configured yet
    if (GMAIL_USER === 'yourcollegeemail@gmail.com') {
        console.log(`\n📧 [SIMULATION - Set Gmail App Password to enable real emails]`);
        console.log(`To: ${to} | Subject: ${subject}\n`);
        return;
    }

    try {
        await transporter.sendMail({
            from: `"Campus Placement Cell" <${GMAIL_USER}>`,
            to, subject, text
        });
        console.log(`\n📬 REAL EMAIL SENT TO: [${to}]`);
    } catch (err) {
        console.error('❌ Email sending failed:', err.message);
    }
}

// ==========================================
// 3. PERMANENT LOCAL MONGODB CONNECTION
// ==========================================
const MONGO_URI = 'mongodb://127.0.0.1:27017/placementPortalDB';

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('✅ Connected to Permanent Local MongoDB Database!');

        // Create default Admin account if missing
        const adminExists = await Student.findOne({ email: 'admin@college.edu' });
        if (!adminExists) {
            const adminPass = await bcrypt.hash('admin123', 10);
            await Student.create({
                name: 'Placement Officer',
                email: 'admin@college.edu',
                password: adminPass,
                gpa: 10.0,
                branch: 'ADMIN',
                isAdmin: true
            });
            console.log('👑 Permanent Admin Initialized: admin@college.edu | Pass: admin123');
        }
    })
    .catch((err) => console.error('❌ Local MongoDB Connection Error:', err.message));

// ==========================================
// 4. MIDDLEWARE
// ==========================================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied. Token missing.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token.' });
        req.user = user;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
    next();
};

// ==========================================
// 5. AUTHENTICATION & RESUME ROUTES
// ==========================================

// Student Registration with Resume Upload
app.post('/api/auth/register', upload.single('resume'), async (req, res) => {
    try {
        const { name, email, password, gpa, branch } = req.body;
        const normalizedEmail = email.toLowerCase().trim();

        const existingUser = await Student.findOne({ email: normalizedEmail });
        if (existingUser) return res.status(400).json({ error: 'An account with this email already exists!' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const student = new Student({
            name,
            email: normalizedEmail,
            password: hashedPassword,
            gpa: parseFloat(gpa),
            branch,
            isAdmin: false,
            resume: req.file ? `/uploads/${req.file.filename}` : ''
        });

        await student.save();

        // Welcome Email Alert
        sendEmailNotification(
            normalizedEmail,
            '🎓 Registration Successful - Campus Placement Portal',
            `Hello ${name},\n\nWelcome to the Placement Portal! Your account has been registered successfully. You can now log in, upload your resume, and apply for active recruitment drives.`
        );

        res.status(201).json({ message: 'Registration successful! You can now log in.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Student Dashboard Resume Update Route
app.post('/api/student/resume', authenticateToken, upload.single('resume'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Please select a PDF file to upload.' });
        
        const resumePath = `/uploads/${req.file.filename}`;
        await Student.findByIdAndUpdate(req.user.id, { resume: resumePath });

        res.json({ message: 'Resume uploaded successfully!', resume: resumePath });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password, loginType } = req.body;
        const normalizedEmail = email.toLowerCase().trim();

        const user = await Student.findOne({ email: normalizedEmail });
        if (!user) return res.status(400).json({ error: `No user account found for '${email}'. Please register first.` });

        if (loginType === 'admin' && !user.isAdmin) {
            return res.status(403).json({ error: 'Access Denied: This is a Student account, not an Admin account.' });
        }
        if (loginType === 'student' && user.isAdmin) {
            return res.status(403).json({ error: 'This is an Admin account. Please use the Admin Portal tab to sign in.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Incorrect password. Please try again.' });

        const token = jwt.sign(
            { id: user._id, gpa: user.gpa, name: user.name, isAdmin: user.isAdmin, email: user.email },
            JWT_SECRET,
            { expiresIn: '2h' }
        );

        res.json({ 
            token, 
            user: { id: user._id, name: user.name, gpa: user.gpa, branch: user.branch, isAdmin: user.isAdmin, resume: user.resume, email: user.email } 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 6. JOBS, APPLICATIONS & ALERTS
// ==========================================

app.get('/api/jobs', async (req, res) => res.json(await Job.find().sort({ createdAt: -1 })));
app.get('/api/resources', async (req, res) => res.json(await Resource.find().sort({ createdAt: -1 })));

app.post('/api/jobs', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const job = new Job(req.body);
        await job.save();
        res.status(201).json({ message: 'Placement Drive Created', job });
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/resources', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const resource = new Resource(req.body);
        await resource.save();
        res.status(201).json({ message: 'Study Resource Created', resource });
    } catch (err) { res.status(400).json({ error: err.message }); }
});

// Apply for Job + Real Email Confirmation
app.post('/api/jobs/apply', authenticateToken, async (req, res) => {
    if (req.user.isAdmin) return res.status(403).json({ error: 'Admins cannot apply for placement drives.' });

    try {
        const { jobId } = req.body;
        const job = await Job.findById(jobId);
        if (!job) return res.status(404).json({ error: 'Job drive not found.' });

        if (req.user.gpa < job.minGpa) {
            return res.status(403).json({ 
                error: `Automated Screening Failed: Your GPA (${req.user.gpa}) is below required (${job.minGpa}) for ${job.companyName}.` 
            });
        }

        const existing = await Application.findOne({ studentId: req.user.id, jobId });
        if (existing) return res.status(400).json({ error: 'You have already applied for this drive.' });

        await new Application({ studentId: req.user.id, jobId }).save();

        // Send Email Confirmation
        sendEmailNotification(
            req.user.email,
            `✅ Application Received: ${job.companyName}`,
            `Hi ${req.user.name},\n\nYour application for ${job.role} at ${job.companyName} (CTC: ${job.ctc}) has been successfully submitted!\n\nYou can track your application status anytime on your portal dashboard.`
        );

        res.json({ message: `Successfully applied for ${job.companyName} (${job.role})!` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Update Application Status + Status Email Alert
app.patch('/api/applications/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const application = await Application.findByIdAndUpdate(req.params.id, { status }, { new: true })
            .populate('studentId')
            .populate('jobId');

        if (application && application.studentId) {
            sendEmailNotification(
                application.studentId.email,
                `📢 Status Update: ${application.jobId.companyName} Drive`,
                `Hello ${application.studentId.name},\n\nYour application status for ${application.jobId.companyName} (${application.jobId.role}) has been updated to:\n\n👉 [ ${status.toUpperCase()} ]\n\nPlease check your portal dashboard for further details.`
            );
        }

        res.json({ message: 'Status updated & Email Notification sent to student!', application });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/applications/my', authenticateToken, async (req, res) => {
    try {
        res.json(await Application.find({ studentId: req.user.id }).populate('jobId').sort({ createdAt: -1 }));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/applications/all', authenticateToken, requireAdmin, async (req, res) => {
    try {
        res.json(await Application.find()
            .populate('studentId', 'name email gpa branch resume')
            .populate('jobId', 'companyName role ctc')
            .sort({ createdAt: -1 }));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => console.log(`🚀 Placement Server running on http://localhost:${PORT}`));