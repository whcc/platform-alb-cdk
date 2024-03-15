import { StackProps } from 'aws-cdk-lib';

export interface Props extends StackProps {
  vpcArn: string;
  config: Config;
}

export interface Config {
  environment: string;
  regionCode: string;
  region?: string;
  account?: string;
}

