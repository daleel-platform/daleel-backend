import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor.js';
import { DELETED_MESSAGE_PLACEHOLDER } from '../src/modules/messaging/messaging.constants.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Messaging (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let jwtSecret: string;
  let baseUrl: string;

  let user1Id: string;
  let user2Id: string;
  let user3Id: string;

  let user1Token: string;
  let user2Token: string;
  let user3Token: string;

  let conversationId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());

    // Listen on ephemeral port for Socket.IO testing
    await app.listen(0);

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://localhost:${address.port}`;

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    const configService = app.get(ConfigService);
    jwtSecret = configService.getOrThrow<string>('JWT_SECRET');

    // Clean up test data
    await prisma.user.deleteMany({
      where: { email: { contains: 'messaging-e2e' } },
    });

    // Seed test users
    const u1 = await prisma.user.create({
      data: {
        email: 'messaging-e2e-u1@example.com',
        name: 'User One',
        passwordHash: 'hash1',
      },
    });
    user1Id = u1.id;

    const u2 = await prisma.user.create({
      data: {
        email: 'messaging-e2e-u2@example.com',
        name: 'User Two',
        passwordHash: 'hash2',
      },
    });
    user2Id = u2.id;

    const u3 = await prisma.user.create({
      data: {
        email: 'messaging-e2e-u3@example.com',
        name: 'User Three',
        passwordHash: 'hash3',
      },
    });
    user3Id = u3.id;

    user1Token = await jwtService.signAsync(
      { sub: user1Id },
      { secret: jwtSecret, expiresIn: 900 },
    );
    user2Token = await jwtService.signAsync(
      { sub: user2Id },
      { secret: jwtSecret, expiresIn: 900 },
    );
    user3Token = await jwtService.signAsync(
      { sub: user3Id },
      { secret: jwtSecret, expiresIn: 900 },
    );
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({
        where: { email: { contains: 'messaging-e2e' } },
      });
    }
    if (app) {
      await app.close();
    }
  });

  describe('REST: Conversations & Messages', () => {
    it('POST /api/v1/conversations - rejects unauthenticated requests', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/conversations')
        .send({ recipientId: user2Id })
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('POST /api/v1/conversations - rejects conversation with oneself', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ recipientId: user1Id })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('yourself');
    });

    it('POST /api/v1/conversations - creates a conversation between user1 and user2', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ recipientId: user2Id })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      conversationId = res.body.data.id;

      // Verify canonical ordering
      const expectedP1 = user1Id < user2Id ? user1Id : user2Id;
      const expectedP2 = user1Id < user2Id ? user2Id : user1Id;
      expect(res.body.data.participant1Id).toBe(expectedP1);
      expect(res.body.data.participant2Id).toBe(expectedP2);
    });

    it('POST /api/v1/conversations - returns existing conversation on duplicate call', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ recipientId: user1Id })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(conversationId);
    });

    it('GET /api/v1/conversations - returns user conversations list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/conversations')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(
        res.body.data.some((c: { id: string }) => c.id === conversationId),
      ).toBe(true);
    });

    it('GET /api/v1/conversations/:id/messages - forbids non-participant', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${user3Token}`)
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('GET /api/v1/conversations/:id/messages - returns initial empty message history for participant', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.hasMore).toBe(false);
      expect(res.body.data.nextCursor).toBeNull();
    });
  });

  describe('WebSocket Gateway: Real-Time Messaging Flow', () => {
    it('should reject unauthenticated socket connection', async () => {
      await new Promise<void>((resolve) => {
        const socket = io(baseUrl, {
          transports: ['websocket'],
          reconnection: false,
        });

        socket.on('connect_error', () => {
          socket.disconnect();
          resolve();
        });

        socket.on('disconnect', () => {
          resolve();
        });
      });
    });

    it('should reject socket connection with invalid token', async () => {
      await new Promise<void>((resolve) => {
        const socket = io(baseUrl, {
          auth: { token: 'invalid.jwt.token' },
          transports: ['websocket'],
          reconnection: false,
        });

        socket.on('connect_error', () => {
          socket.disconnect();
          resolve();
        });

        socket.on('disconnect', () => {
          resolve();
        });
      });
    });

    it('should establish connection, send message, broadcast, reply, edit, and soft delete', async () => {
      const client1: Socket = io(baseUrl, {
        auth: { token: user1Token },
        transports: ['websocket'],
        reconnection: false,
      });

      const client2: Socket = io(baseUrl, {
        auth: { token: user2Token },
        transports: ['websocket'],
        reconnection: false,
      });

      const client3: Socket = io(baseUrl, {
        auth: { token: user3Token },
        transports: ['websocket'],
        reconnection: false,
      });

      // Wait for all 3 clients to connect
      await Promise.all([
        new Promise<void>((resolve) => client1.on('connect', resolve)),
        new Promise<void>((resolve) => client2.on('connect', resolve)),
        new Promise<void>((resolve) => client3.on('connect', resolve)),
      ]);

      // 1. Non-participant client3 attempts to join room -> receives error
      await new Promise<void>((resolve) => {
        client3.emit(
          'joinConversation',
          { conversationId },
          (_response: unknown) => {
            // acknowledgement callback if any
          },
        );

        client3.on('error', (err: { message: string }) => {
          expect(err.message).toContain('not a participant');
          resolve();
        });
      });

      // 2. Both User1 and User2 join the conversation room
      const join1 = await new Promise<{ success: boolean }>((resolve) => {
        client1.emit(
          'joinConversation',
          { conversationId },
          (res: { success: boolean }) => resolve(res),
        );
      });
      expect(join1.success).toBe(true);

      const join2 = await new Promise<{ success: boolean }>((resolve) => {
        client2.emit(
          'joinConversation',
          { conversationId },
          (res: { success: boolean }) => resolve(res),
        );
      });
      expect(join2.success).toBe(true);

      // 3. User1 sends a message -> User2 receives 'messageCreated' broadcast
      let createdMessageId = '';
      const [sendAck, broadcastReceived] = await Promise.all([
        new Promise<{
          success: boolean;
          data: { id: string; content: string };
        }>((resolve) => {
          client1.emit(
            'sendMessage',
            {
              conversationId,
              content: 'Hello User Two!',
            },
            (ack: {
              success: boolean;
              data: { id: string; content: string };
            }) => resolve(ack),
          );
        }),
        new Promise<{ id: string; content: string; senderId: string }>(
          (resolve) => {
            client2.on('messageCreated', (msg) => resolve(msg));
          },
        ),
      ]);

      expect(sendAck.success).toBe(true);
      expect(sendAck.data.id).toBeDefined();
      expect(sendAck.data.content).toBe('Hello User Two!');
      expect(broadcastReceived.id).toBe(sendAck.data.id);
      expect(broadcastReceived.senderId).toBe(user1Id);
      createdMessageId = sendAck.data.id;

      // 4. User2 replies to User1's message using replyMessage
      let replyMessageId = '';
      const [replyAck, replyBroadcast] = await Promise.all([
        new Promise<{
          success: boolean;
          data: {
            id: string;
            content: string;
            replyTo: { id: string; content: string };
          };
        }>((resolve) => {
          client2.emit(
            'replyMessage',
            {
              conversationId,
              content: 'Replying to your greeting!',
              replyToId: createdMessageId,
            },
            (ack: {
              success: boolean;
              data: {
                id: string;
                content: string;
                replyTo: { id: string; content: string };
              };
            }) => resolve(ack),
          );
        }),
        new Promise<{
          id: string;
          content: string;
          replyTo: { id: string; content: string };
        }>((resolve) => {
          client1.on('messageCreated', (msg) => resolve(msg));
        }),
      ]);

      expect(replyAck.success).toBe(true);
      expect(replyAck.data.id).toBeDefined();
      expect(replyAck.data.content).toBe('Replying to your greeting!');
      expect(replyAck.data.replyTo).toBeDefined();
      expect(replyAck.data.replyTo.id).toBe(createdMessageId);
      expect(replyAck.data.replyTo.content).toBe('Hello User Two!');
      expect(replyBroadcast.id).toBe(replyAck.data.id);
      replyMessageId = replyAck.data.id;

      // 5. User1 edits their first message -> User2 receives 'messageUpdated'
      const [editAck, editBroadcast] = await Promise.all([
        new Promise<{
          success: boolean;
          data: { id: string; content: string; isEdited: boolean };
        }>((resolve) => {
          client1.emit(
            'editMessage',
            {
              messageId: createdMessageId,
              content: 'Hello User Two! (edited)',
            },
            (ack: {
              success: boolean;
              data: { id: string; content: string; isEdited: boolean };
            }) => resolve(ack),
          );
        }),
        new Promise<{ id: string; content: string; isEdited: boolean }>(
          (resolve) => {
            client2.on('messageUpdated', (msg) => resolve(msg));
          },
        ),
      ]);

      expect(editAck.success).toBe(true);
      expect(editAck.data.content).toBe('Hello User Two! (edited)');
      expect(editAck.data.isEdited).toBe(true);
      expect(editBroadcast.content).toBe('Hello User Two! (edited)');

      // 6. User2 tries to edit User1's message -> receives error
      await new Promise<void>((resolve) => {
        client2.emit('editMessage', {
          messageId: createdMessageId,
          content: 'Malicious edit',
        });
        client2.on('error', (err: { message: string }) => {
          expect(err.message).toContain('only edit your own');
          resolve();
        });
      });

      // 7. User2 deletes their reply message -> User1 receives 'messageDeleted'
      const [deleteAck, deleteBroadcast] = await Promise.all([
        new Promise<{
          success: boolean;
          data: { id: string; content: string; isDeleted: boolean };
        }>((resolve) => {
          client2.emit(
            'deleteMessage',
            { messageId: replyMessageId },
            (ack: {
              success: boolean;
              data: { id: string; content: string; isDeleted: boolean };
            }) => resolve(ack),
          );
        }),
        new Promise<{ messageId: string; isDeleted: boolean }>((resolve) => {
          client1.on('messageDeleted', (msg) => resolve(msg));
        }),
      ]);

      expect(deleteAck.success).toBe(true);
      expect(deleteAck.data.isDeleted).toBe(true);
      expect(deleteAck.data.content).toBe(DELETED_MESSAGE_PLACEHOLDER);
      expect(deleteBroadcast.messageId).toBe(replyMessageId);
      expect(deleteBroadcast.isDeleted).toBe(true);

      // Cleanup sockets
      client1.disconnect();
      client2.disconnect();
      client3.disconnect();

      // 8. Verify REST history endpoint reflects the edits, replies, and soft-delete masking
      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(historyRes.body.success).toBe(true);
      const items = historyRes.body.data.items;
      expect(items).toHaveLength(2);

      const [msg1, msg2] = items;
      expect(msg1.id).toBe(createdMessageId);
      expect(msg1.content).toBe('Hello User Two! (edited)');
      expect(msg1.isEdited).toBe(true);
      expect(msg1.isDeleted).toBe(false);

      expect(msg2.id).toBe(replyMessageId);
      expect(msg2.content).toBe(DELETED_MESSAGE_PLACEHOLDER);
      expect(msg2.isDeleted).toBe(true);
      expect(msg2.replyTo?.content).toBe('Hello User Two! (edited)');

      // 9. Verify cursor pagination with limit 1
      const page1Res = await request(app.getHttpServer())
        .get(`/api/v1/conversations/${conversationId}/messages?limit=1`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(page1Res.body.data.items).toHaveLength(1);
      expect(page1Res.body.data.hasMore).toBe(true);
      expect(page1Res.body.data.nextCursor).toBeDefined();

      const cursor = page1Res.body.data.nextCursor;
      const page2Res = await request(app.getHttpServer())
        .get(
          `/api/v1/conversations/${conversationId}/messages?cursor=${cursor}&limit=1`,
        )
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(page2Res.body.data.items).toHaveLength(1);
      expect(page2Res.body.data.items[0].id).toBe(msg1.id);
    });
  });
});
