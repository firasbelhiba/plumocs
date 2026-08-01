// Integration tests hit a real database; load .env the same way the app does.
import { config } from 'dotenv';
config();
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for integration tests — copy .env.example to .env');
}
