const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const { setupPersistence } = require('./data/database');
setupPersistence();

const authRoutes = require('./routes/authRoutes');
const cityObjectRoutes = require('./routes/cityObjectRoutes');
const placeRoutes = require('./routes/placeRoutes');
const sensorRoutes = require('./routes/sensorRoutes');
const eventRoutes = require('./routes/eventRoutes');
const locationRoutes = require('./routes/locationRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const planRoutes = require('./routes/planRoutes');
const evacuationRoutes = require('./routes/evacuationRoutes');
const taskRoutes = require('./routes/taskRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const statisticsRoutes = require('./routes/statisticsRoutes');
const commandRoutes = require('./routes/commandRoutes');
const meetingRoutes = require('./routes/meetingRoutes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: '数字孪生城市应急联动后端服务',
    version: '1.0.0'
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/city-objects', cityObjectRoutes);
app.use('/api/places', placeRoutes);
app.use('/api/sensors', sensorRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/evacuation', evacuationRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/command', commandRoutes);
app.use('/api/meetings', meetingRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    code: err.status || 500,
    message: err.message || '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    code: 404,
    message: '接口不存在',
    path: req.originalUrl,
    method: req.method
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`数字孪生城市应急联动后端服务已启动`);
  console.log(`端口: ${PORT}`);
  console.log(`环境: ${process.env.NODE_ENV}`);
  console.log(`健康检查: http://localhost:${PORT}/api/health`);
  console.log(`========================================\n`);
});

module.exports = app;
