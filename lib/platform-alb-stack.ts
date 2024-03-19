import { Duration, Stack } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as alb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { Props } from './types';
import * as targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as action from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { NameBuilder } from './utilities/naming';

export class PlatformDevCdkStack extends Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    // Initialize namebuilder.
    const nameBuilder = new NameBuilder(props.config)

    // Get our existing VPC
    let vpc: ec2.IVpc;
    vpc = ec2.Vpc.fromLookup(this, 'vpc', { vpcId: props.vpcArn });

    // Create custom security group
    const devInternalSecurityGroup = new ec2.SecurityGroup(this, 'devInternalSecurityGroup', {
      vpc, 
      allowAllOutbound: true,
      securityGroupName: nameBuilder.GetAwsNaming('alb-security-group')
    });
    devInternalSecurityGroup.addIngressRule(ec2.Peer.ipv4('10.0.0.0/8'), ec2.Port.tcp(80));
    devInternalSecurityGroup.addIngressRule(ec2.Peer.ipv4('10.0.0.0/8'), ec2.Port.tcp(443));

    // This is necessary to remove the default inbound rules.
    const devInternalSecurityGroupImmutable = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "devInternalSecurityGroupImmutable",
      devInternalSecurityGroup.securityGroupId,
      { mutable: false } // This flag disables creation of unnecessary default 0.0.0.0 inbound rules.
    );

    // Create the load balancer in a VPC. Value for 'internetFacing' is 'false', this will create an internal load balancer.
    const lb = new alb.ApplicationLoadBalancer(this, 'LB', {
      vpc,
      internetFacing: false,
      securityGroup: devInternalSecurityGroupImmutable,
      loadBalancerName: nameBuilder.GetAwsNaming('platform-internal-alb') // Load balancer name cannot start with internal-
    });

    // Login target group
    const loginTargetGroup = new alb.ApplicationTargetGroup(this, 'DevLoginTargetGroup', {
      port: 80,
      protocol: alb.ApplicationProtocol.HTTP,
      targetType: alb.TargetType.IP,
      targetGroupName: nameBuilder.GetAwsNaming('login-target-group'),
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
    const oasTargetGroup = new alb.ApplicationTargetGroup(this, 'DevOasTargetGroup', {
      port: 80,
      protocol: alb.ApplicationProtocol.HTTP,
      targetGroupName: nameBuilder.GetAwsNaming('oas-target-group'),
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
      targetGroupName: nameBuilder.GetAwsNaming('gp-target-group'),
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
        alb.ListenerCondition.hostHeaders(['dev-gpintegration.whcc.com'])
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
        alb.ListenerCondition.hostHeaders(['dev-gpintegration.whcc.com'])
      ],
      action: alb.ListenerAction.forward([gpTargetGroup]),
    });

    // Add OAS rule
    httpsListener.addAction('httpsOasAction', {
      priority: 2,
      conditions: [
        alb.ListenerCondition.hostHeaders(['dev-apps.whcc.com']),
      ],
      action: alb.ListenerAction.forward([oasTargetGroup]),
    });

    // Add Login rule
    httpsListener.addAction('httpsLoginAction', {
      priority: 3,
      conditions: [
        alb.ListenerCondition.hostHeaders(['dev-login.whcc.com'])
      ],
      action: alb.ListenerAction.forward([loginTargetGroup]),
    });

    // Default rule: return 503
    httpsListener.addAction('defaultHttpsAction', {
      action: alb.ListenerAction.fixedResponse(503, {
        contentType: 'text/plain',
        messageBody: 'Service Unavailable',
      }),
    });

    const alertBackendServiceArn = "arn:aws:sns:us-east-2:799497006720:alerts-backend-services";
    const alertBackendServiceTopic = Topic.fromTopicArn(this, "alertBackendServicesTopic", alertBackendServiceArn);

    const alarmNames: string[] = ['login', 'gp', 'oas' ];

    alarmNames.forEach(name => {
        const albAlarm = new cloudwatch.Alarm(this, `${name}AlbAlarm`, {
          comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
          threshold: 1,
          evaluationPeriods: 1,
          metric: loginTargetGroup.metrics.healthyHostCount(),
          datapointsToAlarm: 1,
          actionsEnabled: true,
          alarmName: nameBuilder.GetAwsNaming(`${name}-alb-alarm`)
        });
        albAlarm.addAlarmAction(new action.SnsAction(alertBackendServiceTopic))
    });
  }
}