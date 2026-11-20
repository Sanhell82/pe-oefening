const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();
const PORT = process.env.PORT || 3000;
const unusedVar = 42; // This is an unused variable for testing linting

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'PXL Node.js API',
      version: '1.0.0',
      description: 'Simple API for PE Github Actions assignment',
    },
  },
  apis: ['./app.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Swagger UI setup on root route
app.use('/', swaggerUi.serve);
app.get('/', swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * /hello:
 *   get:
 *     summary: Returns a greeting message
 *     description: Returns "HELLO PXL"
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: HELLO PXL
 */
app.get('/hello', (req, res) => {
  res.send('HELLO PXL');
});

// Start server only if not in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

module.exports = app;