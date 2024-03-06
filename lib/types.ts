import { Duration, Stack, StackProps } from 'aws-cdk-lib';

export interface AwsConfig extends StackProps {
  vpcArn: string
}