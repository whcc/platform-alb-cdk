import { Duration, Stack } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as alb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { AwsConfig } from './types';
import * as targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as action from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';

export class PlatformDevCdkStack extends Stack {
  constructor(scope: Construct, id: string, awsConfig: AwsConfig) {
    super(scope, id, awsConfig);

    // Get our existing VPC
    let vpc: ec2.IVpc;
    vpc = ec2.Vpc.fromLookup(this, 'vpc', { vpcId: awsConfig.vpcArn });

    // Create the load balancer in a VPC. Value for 'internetFacing' is 'false', this will create an internal load balancer.
    const lb = new alb.ApplicationLoadBalancer(this, 'LB', {
      vpc,
      internetFacing: false
    });

    const devInternalSecurityGroup = new ec2.SecurityGroup(this, 'devInternalSecurityGroup', { vpc, allowAllOutbound: true });
    lb.addSecurityGroup(devInternalSecurityGroup);

    // Login
    const whccloginTargetGroup = new alb.ApplicationTargetGroup(this, 'DevWhccloginTargetGroup', {
      port: 80,
      protocol: alb.ApplicationProtocol.HTTP,
      targetType: alb.TargetType.IP,
      // targetGroupName: 'dev2-login-whcc-com',
      targets: [
        new targets.IpTarget('10.32.26.180')
      ],
      healthCheck: {
        path: '/health',
        healthyHttpCodes: '200-204',
        port: '3063',
        interval: Duration.seconds(10)
      },
      vpc,
    });

    // Prodpi login
    const prodpiLoginTargetGroup = new alb.ApplicationTargetGroup(this, 'DevProdpiLoginTargetGroup', {
      port: 80,
      protocol: alb.ApplicationProtocol.HTTP,
      targetType: alb.TargetType.IP,
      // targetGroupName: 'dev2-login-whcc-com',
      targets: [
        new targets.IpTarget('10.32.26.180')
      ],
      healthCheck: {
        path: '/health',
        healthyHttpCodes: '200-204',
        port: '3063',
        interval: Duration.seconds(10)
      },
      vpc,
    });

    // OAS
    const oasTargetGroup = new alb.ApplicationTargetGroup(this, 'oasApiTargetGroup', {
      port: 80,
      protocol: alb.ApplicationProtocol.HTTP,
      // targetGroupName: 'dev2-oas-api',
      targetType: alb.TargetType.IP,
      targets: [
        new targets.IpTarget('10.32.26.180')
      ],
      healthCheck: {
        path: '/api/health',
        healthyHttpCodes: '200-204',
        port: '3002',
        interval: Duration.seconds(10)
      },
      vpc
    });

    // GPIntegration
    const gpTargetGroup = new alb.ApplicationTargetGroup(this, 'DevGpIntegrationTargetGroup', {
      port: 80,
      protocol: alb.ApplicationProtocol.HTTP,
      targetType: alb.TargetType.IP,
      // targetGroupName: 'dev2-gpintegration',
      targets: [
        new targets.IpTarget('10.32.26.180')
      ],
      healthCheck: {
        path: '/gp/health',
        healthyHttpCodes: '200-204',
        port: '3039',
        interval: Duration.seconds(10)
      },
      vpc
    });

    // HTTP:80 Listener
    const httpListener = lb.addListener('HTTPListener', { port: 80, open: true });

    httpListener.addAction('defaultHttpAction', {
      action: alb.ListenerAction.redirect({ protocol: 'HTTPS', port: '443', host: '#{host}', path: '/#{path}', query: '#{query}', permanent: true }),
    });

    // GPIntegration should accept both plain HTTP and HTTPS
    httpListener.addAction('httpGpIntAction', {
      priority: 2,
      conditions: [
        alb.ListenerCondition.pathPatterns(['/*']),
        alb.ListenerCondition.hostHeaders(['dev-gpintegration.whcc.com']),
      ],
      action: alb.ListenerAction.forward([gpTargetGroup]),
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

    // Add GPInt rule
    httpsListener.addAction('httpsGpIntActionAllPaths', {
      priority: 2,
      conditions: [
        alb.ListenerCondition.pathPatterns(['/*']),
        alb.ListenerCondition.hostHeaders(['dev-gpintegration.whcc.com']),
      ],
      action: alb.ListenerAction.forward([gpTargetGroup]),
    });

    // Add OAS rule
    httpsListener.addAction('httpsOasAction', {
      priority: 3,
      conditions: [
        alb.ListenerCondition.pathPatterns(['/']),
        alb.ListenerCondition.hostHeaders(['dev-apps.whcc.com']),
      ],
      action: alb.ListenerAction.forward([oasTargetGroup]),
    });

    httpsListener.addAction('httpsOasActionAllAllPaths', {
      priority: 4,
      conditions: [
        alb.ListenerCondition.pathPatterns(['/*']),
        alb.ListenerCondition.hostHeaders(['dev-apps.whcc.com']),
      ],
      action: alb.ListenerAction.forward([oasTargetGroup]),
    });

    // Add Login rule
    httpsListener.addAction('httpsLoginAction', {
      priority: 5,
      conditions: [
        alb.ListenerCondition.pathPatterns(['/']),
        alb.ListenerCondition.hostHeaders(['dev-login.whcc.com']),
      ],
      action: alb.ListenerAction.forward([whccloginTargetGroup]),
    });

    httpsListener.addAction('httpsLoginActionAllPaths', {
      priority: 6,
      conditions: [
        alb.ListenerCondition.pathPatterns(['/*']),
        alb.ListenerCondition.hostHeaders(['dev-login.whcc.com']),
      ],
      action: alb.ListenerAction.forward([whccloginTargetGroup]),
    });

    // Add Prodpi login rule
    httpsListener.addAction('httpsProdpiLoginAction', {
      priority: 7,
      conditions: [
        alb.ListenerCondition.pathPatterns(['/']),
        alb.ListenerCondition.hostHeaders(['dev.login.prodpi.com']),
      ],
      action: alb.ListenerAction.forward([prodpiLoginTargetGroup]),
    });

    httpsListener.addAction('httpsProdpiLoginActionAllPaths', {
      priority: 8,
      conditions: [
        alb.ListenerCondition.pathPatterns(['/*']),
        alb.ListenerCondition.hostHeaders(['dev.login.prodpi.com']),
      ],
      action: alb.ListenerAction.forward([prodpiLoginTargetGroup]),
    });

    // Default rule: return 503
    httpsListener.addAction('defaultHttpsAction', {
      action: alb.ListenerAction.fixedResponse(503, {
        contentType: 'text/plain',
        messageBody: 'Service Unavailable',
      }),
    });

    const alertBackendServiceArn = "arn:aws:sns:us-east-2:799497006720:alerts-backend-services";
    const alertBackendServiceTopic = Topic.fromTopicArn(this, "AlertBackendServicesTopic", alertBackendServiceArn);

    const whccLoginAlbAlarm = new cloudwatch.Alarm(this, 'whccLoginAlbAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      metric: whccloginTargetGroup.metrics.healthyHostCount(),
      datapointsToAlarm: 1,
      actionsEnabled: true
    });
    whccLoginAlbAlarm.addAlarmAction(new action.SnsAction(alertBackendServiceTopic))

    const prodpiLoginAlbAlarm = new cloudwatch.Alarm(this, 'prodpiLoginAlbAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      metric: prodpiLoginTargetGroup.metrics.healthyHostCount(),
      datapointsToAlarm: 1,
      actionsEnabled: true
    });
    prodpiLoginAlbAlarm.addAlarmAction(new action.SnsAction(alertBackendServiceTopic))

    const gpTargetAlbAlarm = new cloudwatch.Alarm(this, 'gpTargetAlbAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      metric: gpTargetGroup.metrics.healthyHostCount(),
      datapointsToAlarm: 1,
      actionsEnabled: true
    });
    gpTargetAlbAlarm.addAlarmAction(new action.SnsAction(alertBackendServiceTopic))

    const oasAlbAlarm = new cloudwatch.Alarm(this, 'oasAlbAlarm', {
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      metric: oasTargetGroup.metrics.healthyHostCount(),
      datapointsToAlarm: 1,
      actionsEnabled: true
    });
    oasAlbAlarm.addAlarmAction(new action.SnsAction(alertBackendServiceTopic))

    alertBackendServiceTopic.addSubscription(new subscriptions.UrlSubscription())
  }
}