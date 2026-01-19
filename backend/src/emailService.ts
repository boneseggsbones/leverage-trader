/**
 * Email Service
 * Sends email notifications for important trade events
 */

import nodemailer from 'nodemailer';
import { NotificationType } from './notifications/types';

// Create transporter with SMTP config from environment
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const EMAIL_FROM = process.env.EMAIL_FROM || 'Leverage <noreply@leverage.app>';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Check if email is configured
export function isEmailConfigured(): boolean {
    return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

// Email template wrapper
function wrapTemplate(content: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Leverage</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Collectible Trading Platform</p>
        </div>
        
        <!-- Content -->
        <div style="background: white; padding: 32px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            ${content}
        </div>
        
        <!-- Footer -->
        <div style="text-align: center; padding: 24px; color: #64748b; font-size: 12px;">
            <p style="margin: 0;">This email was sent by Leverage.</p>
            <p style="margin: 8px 0 0 0;">
                <a href="${APP_URL}" style="color: #3b82f6; text-decoration: none;">Visit Leverage</a>
            </p>
        </div>
    </div>
</body>
</html>`;
}

// Email templates by notification type
function getEmailTemplate(type: NotificationType, title: string, message: string, tradeId?: string | null): { subject: string; html: string } {
    const viewButton = tradeId
        ? `<a href="${APP_URL}/trades?highlight=${tradeId}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px;">View Trade</a>`
        : `<a href="${APP_URL}/trades" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px;">View Trades</a>`;

    let icon = '🔔';
    let accentColor = '#3b82f6';

    switch (type) {
        case NotificationType.TRADE_PROPOSED:
            icon = '📨';
            accentColor = '#3b82f6';
            break;
        case NotificationType.TRADE_ACCEPTED:
            icon = '✅';
            accentColor = '#22c55e';
            break;
        case NotificationType.ESCROW_FUNDED:
            icon = '💰';
            accentColor = '#22c55e';
            break;
        case NotificationType.TRADE_COMPLETED:
            icon = '🎉';
            accentColor = '#8b5cf6';
            break;
        case NotificationType.DISPUTE_OPENED:
            icon = '⚠️';
            accentColor = '#f59e0b';
            break;
    }

    const content = `
        <div style="text-align: center;">
            <div style="font-size: 48px; margin-bottom: 16px;">${icon}</div>
            <h2 style="color: #1e293b; margin: 0 0 12px 0; font-size: 24px;">${title}</h2>
            <p style="color: #64748b; margin: 0; font-size: 16px; line-height: 1.6;">${message}</p>
            <div style="margin-top: 24px;">
                ${viewButton}
            </div>
        </div>
    `;

    return {
        subject: `${icon} ${title}`,
        html: wrapTemplate(content)
    };
}

// High-priority notification types that should trigger emails
const EMAIL_ENABLED_TYPES: NotificationType[] = [
    NotificationType.TRADE_PROPOSED,
    NotificationType.TRADE_ACCEPTED,
    NotificationType.ESCROW_FUNDED,
    NotificationType.TRADE_COMPLETED,
    NotificationType.DISPUTE_OPENED,
];

/**
 * Send email notification if configured and appropriate
 */
export async function sendEmailNotification(
    recipientEmail: string,
    type: NotificationType,
    title: string,
    message: string,
    tradeId?: string | null
): Promise<boolean> {
    // Skip if email not configured
    if (!isEmailConfigured()) {
        console.log('[Email] SMTP not configured, skipping email');
        return false;
    }

    // Skip if not a high-priority notification type
    if (!EMAIL_ENABLED_TYPES.includes(type)) {
        console.log(`[Email] Notification type ${type} not enabled for email`);
        return false;
    }

    // Skip if no recipient email
    if (!recipientEmail) {
        console.log('[Email] No recipient email provided');
        return false;
    }

    try {
        const { subject, html } = getEmailTemplate(type, title, message, tradeId);

        const info = await transporter.sendMail({
            from: EMAIL_FROM,
            to: recipientEmail,
            subject,
            html,
        });

        console.log(`[Email] Sent to ${recipientEmail}: ${subject} (${info.messageId})`);
        return true;
    } catch (error) {
        console.error('[Email] Failed to send:', error);
        return false;
    }
}

/**
 * Verify SMTP configuration works
 */
export async function verifyEmailConfig(): Promise<boolean> {
    if (!isEmailConfigured()) {
        console.log('[Email] SMTP not configured');
        return false;
    }

    try {
        await transporter.verify();
        console.log('[Email] SMTP configuration verified');
        return true;
    } catch (error) {
        console.error('[Email] SMTP verification failed:', error);
        return false;
    }
}
