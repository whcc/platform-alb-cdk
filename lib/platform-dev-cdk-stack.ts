import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as alb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
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
    const httpListener = lb.addListener('HTTPListener', { port: 80, open: true });

    // TODO: Need to add additional rules???

    httpListener.addAction('defaultHttpAction', {
      action: alb.ListenerAction.redirect({ protocol: 'HTTPS', port: '443', host: '#{host}', path: '/#{path}', query: '#{query}', permanent: true }),
    });

    // OAuth
    const whccloginTargetGroup = new alb.ApplicationTargetGroup(this, 'DevWhccloginTargetGroup', {
      port: 80,
      protocol: alb.ApplicationProtocol.HTTP,
      targetType: alb.TargetType.IP,
      targetGroupName: 'dev2-login-whcc-com',
      targets: [
        new targets.IpTarget('10.32.26.180') // Since this IP address is within the VPC, use default (us-east-2)
      ],
      healthCheck: {
        path: '/health',
        healthyHttpCodes: '200-204',
        port: '3063'
      },
      vpc
    });

    // OAS
    const oasTargetGroup = new alb.ApplicationTargetGroup(this, 'oasApiTargetGroup', {
      port: 80,
      protocol: alb.ApplicationProtocol.HTTP,
      targetGroupName: 'dev2-oas-api',
      targetType: alb.TargetType.IP,
      targets: [
        new targets.IpTarget('10.32.26.180')
      ],
      healthCheck: {
        path: '/api/health',
        healthyHttpCodes: '200-204',
        port: '3002'
      },
      vpc
    });


    // GPIntegration
    const gpTargetGroup = new alb.ApplicationTargetGroup(this, 'DevGpIntegrationTargetGroup', {
      port: 80,
      protocol: alb.ApplicationProtocol.HTTP,
      targetType: alb.TargetType.IP,
      targetGroupName: 'dev2-gpintegration',
      targets: [
        new targets.IpTarget('10.32.26.180')
      ],
      healthCheck: {
        path: '/gp/health',
        healthyHttpCodes: '200-204',
        port: '3039'
      },
      vpc
    });

    // Get wildcard certificate
    const certificateArn = 'arn:aws:acm:us-east-2:799497006720:certificate/ce6306c4-27ee-4d93-b12a-fafab73552af'; // TODO
    const sslCertificate = acm.Certificate.fromCertificateArn(this, 'SSLCertificate', certificateArn);
  
    // HTTPS:443 Listener
    const httpsListener = lb.addListener('HTTPSListener', { port: 443, open: true, certificates: [sslCertificate] });

    // Add GPInt rule
    httpsListener.addAction('httpsGpIntAction', {
      priority: 1,
      conditions: [
        alb.ListenerCondition.pathPatterns(['/']),
        alb.ListenerCondition.hostHeaders(['dev-gpintegration.whcc.com']),
      ],
      action: alb.ListenerAction.forward([gpTargetGroup]),
    });

    // TODO: Add the rest of the rules from the platform-prod alb-internal-apps HTTPS:443 listener

    // Default rule: return 503
    httpsListener.addAction('defaultHttpsAction', {
      action: alb.ListenerAction.fixedResponse(503, {
        contentType: 'text/plain',
        messageBody: 'Service Unavailable',
      }),
    });

  }
}
