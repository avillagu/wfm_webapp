const bcrypt = require('bcrypt');
const hash = '$2b$10$rHxV8KZqJ9zN5vL3mF2pQO7YxKjW8nR4tE6sA1cD9fG0hI2jK3lM4';
bcrypt.compare('admin123', hash).then(res => console.log('Match:', res));
bcrypt.hash('admin123', 10).then(h => console.log('Correct hash:', h));
