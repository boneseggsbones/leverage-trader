import request from 'supertest';
import app from './server';
import { db, init } from './database';
import fs from 'fs';

beforeAll(async () => {
  await init();
});

afterAll((done) => {
  db.close(() => {
    // Clean up uploaded files
    const uploadsDir = './uploads';
    if (fs.existsSync(uploadsDir)) {
      fs.readdirSync(uploadsDir).forEach((file) => {
        fs.unlinkSync(`${uploadsDir}/${file}`);
      });
    }
    done();
  });
});

describe('Item API', () => {
  describe('POST /api/items', () => {
    it('should create a new item with valid data and without an image', async () => {
      const res = await request(app)
        .post('/api/items')
        .field('name', 'Test Item')
        .field('description', 'Test Description')
        .field('owner_id', '1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');

      // Verify the item exists in the database
      const item = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM Item WHERE id = ?', [res.body.id], (err, row) => {
          if (err) reject(err);
          resolve(row);
        });
      });
      expect(item).toBeDefined();
    });

    it('should create a new item with valid data and with an image', async () => {
      const res = await request(app)
        .post('/api/items')
        .field('name', 'Test Item with Image')
        .field('description', 'Test Description with Image')
        .field('owner_id', '1')
        .attach('image', Buffer.from('test image'), 'test.jpg');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');

      // Verify the item exists in the database
      const item: any = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM Item WHERE id = ?', [res.body.id], (err, row) => {
          if (err) reject(err);
          resolve(row);
        });
      });
      expect(item).toBeDefined();
      expect(item.imageUrl).toBeDefined();

      // Verify the image file was saved
      expect(fs.existsSync(`.${item.imageUrl}`)).toBe(true);
    });

    it('should return a 400 error if required fields are missing', async () => {
      const res = await request(app)
        .post('/api/items')
        .field('name', 'Test Item');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/items', () => {
    it('should return all items for a specific user', async () => {
      // First, create an item for a user
      await request(app)
        .post('/api/items')
        .field('name', 'Test Item')
        .field('description', 'Test Description')
        .field('owner_id', '2');

      const res = await request(app).get('/api/items?userId=2');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should return an empty array for a user with no items', async () => {
      const res = await request(app).get('/api/items?userId=3');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });
  });

  describe('PUT /api/items/:id', () => {
    it('should update an existing item with valid data and without an image', async () => {
      // First, create an item
      const createRes = await request(app)
        .post('/api/items')
        .field('name', 'Test Item')
        .field('description', 'Test Description')
        .field('owner_id', '1');

      const res = await request(app)
        .put(`/api/items/${createRes.body.id}`)
        .field('name', 'Updated Test Item')
        .field('description', 'Updated Test Description');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('changes', 1);

      // Verify the item is updated in the database
      const item: any = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM Item WHERE id = ?', [createRes.body.id], (err, row) => {
          if (err) reject(err);
          resolve(row);
        });
      });
      expect(item).toBeDefined();
      expect(item.name).toBe('Updated Test Item');
    });

    it('should update an existing item with a new image', async () => {
      // First, create an item
      const createRes = await request(app)
        .post('/api/items')
        .field('name', 'Test Item')
        .field('description', 'Test Description')
        .field('owner_id', '1');

      const res = await request(app)
        .put(`/api/items/${createRes.body.id}`)
        .field('name', 'Updated Test Item with Image')
        .field('description', 'Updated Test Description with Image')
        .attach('image', Buffer.from('new test image'), 'new_test.jpg');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('changes', 1);

      // Verify the item is updated in the database
      const item: any = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM Item WHERE id = ?', [createRes.body.id], (err, row) => {
          if (err) reject(err);
          resolve(row);
        });
      });
      expect(item).toBeDefined();
      expect(item.imageUrl).toBeDefined();

      // Verify the new image file was saved
      expect(fs.existsSync(`.${item.imageUrl}`)).toBe(true);
    });
  });

  describe('DELETE /api/items/:id', () => {
    it('should delete an existing item', async () => {
      // First, create an item
      const createRes = await request(app)
        .post('/api/items')
        .field('name', 'Test Item')
        .field('description', 'Test Description')
        .field('owner_id', '1');

      const res = await request(app).delete(`/api/items/${createRes.body.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('changes', 1);

      // Verify the item is deleted from the database
      const item = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM Item WHERE id = ?', [createRes.body.id], (err, row) => {
          if (err) reject(err);
          resolve(row);
        });
      });
      expect(item).toBeUndefined();
    });
  });
});

describe('User API', () => {
  describe('GET /api/users/:id', () => {
    it('should return a user by ID', async () => {
      const res = await request(app).get('/api/users/1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', 1);
    });

    it('should return a 404 error if the user does not exist', async () => {
      const res = await request(app).get('/api/users/999');
      expect(res.status).toBe(404);
    });
  });
});
