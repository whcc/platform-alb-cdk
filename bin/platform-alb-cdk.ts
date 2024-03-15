#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PlatformDevCdkStack } from '../lib/platform-alb-stack';
import { DEV_CONFIG } from '../lib/constants';

const app = new cdk.App();
new PlatformDevCdkStack(app, 'platform-dev-alb-cdk', { 
    vpcArn: 'vpc-0fe3d5ebeab236a52',
    config: DEV_CONFIG,
    env: { account: DEV_CONFIG.account, region: DEV_CONFIG.region }
});