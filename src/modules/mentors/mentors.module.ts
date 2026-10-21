import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { MentorsController } from './mentors.controller.js';
import { MentorsService } from './mentors.service.js';

@Module({
  imports: [PrismaModule, UsersModule, JwtModule.register({})],
  controllers: [MentorsController],
  providers: [MentorsService, JwtAuthGuard],
  exports: [MentorsService],
})
export class MentorsModule {}
