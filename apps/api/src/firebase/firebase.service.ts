import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
    private app: admin.app.App;

    constructor(private readonly configService: ConfigService) { }

    onModuleInit() {
        if (admin.apps.length === 0) {
            this.app = admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: this.configService.get<string>('FIREBASE_PROJECT_ID'),
                    privateKey: this.configService
                        .get<string>('FIREBASE_PRIVATE_KEY')
                        ?.replace(/\\n/g, '\n'),
                    clientEmail: this.configService.get<string>('FIREBASE_CLIENT_EMAIL'),
                }),
            });
        } else {
            this.app = admin.apps[0]!;
        }
    }

    getAuth(): admin.auth.Auth {
        return admin.auth(this.app);
    }

    getMessaging(): admin.messaging.Messaging {
        return admin.messaging(this.app);
    }
}
