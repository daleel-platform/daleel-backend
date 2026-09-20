import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor.js';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  it('/api/v1 (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1')
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: {
        status: 'ok',
        service: 'daleel-backend',
      },
    });
    expect(response.body.timestamp).toBeDefined();
    expect(response.body.data.timestamp).toBeDefined();
  });

  afterEach(async () => {
    await app.close();
  });
});
