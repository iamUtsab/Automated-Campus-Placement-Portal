const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    gpa: { type: Number, required: true },
    branch: { type: String, required: true },
    isAdmin: { type: Boolean, default: false },
    resume: { type: String, default: '' } // Path to uploaded PDF resume
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);