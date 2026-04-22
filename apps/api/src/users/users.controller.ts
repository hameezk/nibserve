import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from './entities/user.entity';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get('me')
    getMe(@CurrentUser() user: User) {
        return user;
    }

    @Patch('me')
    updateMe(@CurrentUser() user: User, @Body() dto: UpdateUserDto) {
        return this.usersService.update(user.id, dto);
    }
}
