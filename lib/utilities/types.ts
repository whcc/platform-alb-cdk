import { StackProps } from 'aws-cdk-lib';
import { NameBuilder } from './naming';

export interface Props extends StackProps {
  vpcArn: string;
  namingBuilder: NameBuilder;
}

export interface Naming {
  environment: string;
  region: string;
}

