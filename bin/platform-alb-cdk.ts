#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PlatformDevCdkStack } from '../lib/platform-alb-stack';
import { DEV_NAMING } from '../lib/constants';
import { NameBuilder } from '../lib/utilities/naming';

const app = new cdk.App();
new PlatformDevCdkStack(app, 'platform-dev-alb-cdk', { vpcArn: 'vpc-0fe3d5ebeab236a52', namingBuilder: new NameBuilder(DEV_NAMING), env: { account: '799497006720', region: 'us-east-2'}});