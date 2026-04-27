const app = require('./app');
const config = require('../config');
const logger = require('./utils/logger');

const PORT = config.port;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
