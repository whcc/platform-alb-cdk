import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as alb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';
import { AwsConfig } from './types';
import * as targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
export class PlatformDevCdkStack extends Stack {
  constructor(scope: Construct, id: string, awsConfig: AwsConfig) {
    super(scope, id, awsConfig);

    // Get our existing VPC
    let vpc: ec2.IVpc;
    vpc = ec2.Vpc.fromLookup(this, 'vpc', { vpcId: awsConfig.vpcArn });
    
    // Create the load balancer in a VPC. 'internetFacing' is 'false'
    // by default, which creates an internal load balancer.
    const lb = new alb.ApplicationLoadBalancer(this, 'LB', {
      vpc,
      internetFacing: false
    });

    // HTTP:80 Listener
    const lbListener = lb.addListener('HTTPListener', { port: 80, open: true });

    // OAuth
    const whcclogin = new alb.ApplicationTargetGroup(this, 'DevWhccloginTargetGroup', {
      port: 80,
      protocol: alb.ApplicationProtocol.HTTP,
      targetType: alb.TargetType.IP,
      targetGroupName: 'login-whcc-com',
      targets: [
        new targets.IpTarget('10.32.26.180')
      ],
      healthCheck: {
        path: '/api/health',
        healthyHttpCodes: '200-204'
      },
      vpc
    });

    // OAS
    const oasApi = new alb.ApplicationTargetGroup(this, 'oasApiTargetGroup', {
      port: 80,
      protocol: alb.ApplicationProtocol.HTTP,
      targetGroupName: 'oas-api',
      targetType: alb.TargetType.IP,
      targets: [
        new targets.IpTarget('10.32.26.180')
      ],
      healthCheck: {
        path: '/api/health',
        healthyHttpCodes: '200-204'
      },
      vpc
    });

    // GPIntegration
    const gpTargetGroup = new alb.ApplicationTargetGroup(this, 'DevGpIntegrationTargetGroup', {
      port: 80,
      protocol: alb.ApplicationProtocol.HTTP,
      targetType: alb.TargetType.IP,
      targetGroupName: 'gpintegration',
      targets: [
        new targets.IpTarget('10.32.26.180')
      ],
      healthCheck: {
        path: '/api/health',
        healthyHttpCodes: '200-204'
      },
      vpc
    });

    lbListener.addTargetGroups('AddTargetGroup', {
      targetGroups: [ gpTargetGroup ]
    });
  }
}


