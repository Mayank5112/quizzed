import {
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from './users.repository';
import { CreateUserRequest } from './dto/create-user.request';
import { User } from './schemas/user.schema';
import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async createUser(request: CreateUserRequest) {
    await this.validateCreateUserRequest(request);
    const user = await this.usersRepository.create(request);
    return user;
  }

  private async validateCreateUserRequest(request: Partial<CreateUserRequest>) {
    let user: User;
    try {
      user = await this.usersRepository.findOne({
        $or: [
          { email: request.email },
          { regdNo: request.regdNo },
          { primaryPhone: request.primaryPhone },
        ],
      });
    } catch (err) {}

    if (user) {
      throw new UnprocessableEntityException(
        'User with similar details already exists.',
      );
    }
  }

  async validateUser(regdNo: string, password: string) {
    const user = await this.usersRepository.findOne({ regdNo });
    const passwordIsValid = await bcrypt.compare(password, user.password);
    if (!passwordIsValid) {
      throw new UnauthorizedException('Credentials are not valid.');
    }
    return user;
  }

  async getUser(getUserArgs: Partial<User>) {
    return this.usersRepository.findOne(getUserArgs);
  }

  async fetchDetailsFromIterServer(
    regdNo: string,
    password: string,
  ): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        const SCRIPT_PATH = path.join(
          __dirname,
          '..',
          '..',
          '..',
          'apps',
          'auth',
          'src',
          'scripts',
          'auth.py',
        );
        const python: ChildProcess = spawn('python3', [
          SCRIPT_PATH,
          regdNo,
          password,
        ]);

        await python.stdout?.on('data', (data: string) => {
          resolve(JSON.parse(data.toString()));
        });

        await python.stderr?.on('data', (data: string) => {
          reject(data.toString());
        });

        await python.on('close', (code: number) => {
          console.log(`child process close all stdio with code ${code}`);
          resolve(null);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async createUserObject(
    rawUser: any,
    password: string,
  ): Promise<CreateUserRequest> {
    const user: CreateUserRequest = {
      email: rawUser.detail[0].semailid,
      regdNo: rawUser.detail[0].enrollmentno,
      name: rawUser.detail[0].name,
      admissionYear: rawUser.detail[0].admissionyear,
      branch:
        rawUser.detail[0].programdesc + ' in ' + rawUser.detail[0].branchdesc,
      dateOfBirth: rawUser.detail[0].dateofbirth,
      gender: rawUser.detail[0].gender,
      primaryPhone: rawUser.detail[0].scellno,
      otherPhones: [rawUser.detail[0].stelephoneno, rawUser.detail[0].pcellno],
      semester: rawUser.detail[0].stynumber,
      section: rawUser.detail[0].sectioncode,
      password: await bcrypt.hash(password, 10),
      status: 'active',
      created_at: new Date().toDateString(),
      updated_at: new Date().toDateString(),
      metadata: null,
    };
    return user;
  }
}
