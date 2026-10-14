const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
    companyName: { type: String, required: true },
    role: { type: String, required: true },
    minGpa: { type: Number, required: true },
    ctc: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Job', jobSchema);