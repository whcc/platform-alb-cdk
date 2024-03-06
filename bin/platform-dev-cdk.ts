#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PlatformDevCdkStack } from '../lib/platform-dev-cdk-stack';

const app = new cdk.App();
new PlatformDevCdkStack(app, 'PlatformDevCdkStack');
