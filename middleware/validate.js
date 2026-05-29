const { z } = require('zod');

function validate(schema, target = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: result.error.errors.map(e => ({
          field: e.path.join('.') || target,
          message: e.message
        }))
      });
    }
    req[target] = result.data;
    next();
  };
}

module.exports = { validate, z };
