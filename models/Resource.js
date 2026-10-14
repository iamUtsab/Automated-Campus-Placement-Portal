const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema({
    title: { type: String, required: true },
    category: { type: String, required: true }, // e.g. Mock Paper, Video, Notes
    link: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Resource', resourceSchema);