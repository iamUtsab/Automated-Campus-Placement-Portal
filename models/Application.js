const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    status: { 
        type: String, 
        enum: ['Applied', 'Shortlisted', 'Interview Scheduled', 'Offered', 'Rejected'], 
        default: 'Applied' 
    }
}, { timestamps: true });

module.exports = mongoose.model('Application', applicationSchema);