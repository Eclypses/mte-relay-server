# Introduction:

The MTE API Relay Container is a NodeJS application that encodes and proxies HTTP payloads to another MTE API Relay Container, which decodes and proxies the request to another API Service. The Eclypses MTE is a compiled software library combining quantum-resistant algorithms with proprietary, patented techniques to encode data. A common use case for the MTE API Relay is to add an MTE translation layer of security to HTTP Requests being made across the open internet (Example: A server-side application calls a third-party API service).

# Table of Contents
- [Customer Deployment](#customer-deployment)
      + [Typical Customer Deployment](#typical-customer-deployment)
      + [Configured Services](#when-completed-the-following-services-and-resources-will-be-set-up)
   * [Deployment Options](#deployment-options)
      + [Supported Regions](#supported-regions)
   * [Port Mappings](#port-mappings)
- [Prerequisites and Requirements](#prerequisites-and-requirements)
   * [Technical](#technical)
   * [Skills or Specialized Knowledge](#skills-or-specialized-knowledge)
   * [Configuration](#configuration)
      + [Required Configuration variables](#required-configuration-variables)
      + [Optional Configuration variables](#optional-configuration-variables)
      + [Database Credentials](#database-credentials)
      + [Key/Variable Rotation Recommendations](#keyvariable-rotation-recommendations)
- [Architecture Diagrams](#architecture-diagrams)
   * [Default Deployment - ECS Deployment](#default-deployment-ecs-deployment-ecs-deployment)
   * [Alternative Deployment - EKS Deployment – Multiple Load- Balanced Containers](#alternative-deployment-eks-deployment-multiple-load-balanced-containers-eks-deployment-multiple-load-balanced-containers)
- [Security](#security)
   * [AWS Identity and Access Management (IAM) Roles:](#aws-identity-and-access-management-iam-roles)
      + [VPC (Virtual Private Cloud)](#vpc-virtual-private-cloud)
- [Costs](#costs)
      + [Billable Services](#billable-services)
- [Sizing](#sizing)
   * [ECS](#ecs)
- [Setup - Deployment Assets](#deployment-assets)
   * [VPC Setup](#vpc-setup)
   * [AWS ElastiCache Redis Setup](#aws-elasticache-redis-setup)
      + [ElastiCache Security Group Settings](#elasticache-security-group-settings)
      + [ElastiCache Setup](#elasticache-setup)
   * [Setting up Elastic Container Service (ECS)](#setting-up-elastic-container-service-ecs)
      + [Create an ECS Cluster](#create-an-ecs-cluster)
   * [AWS ECS Setup – Task Definition](#aws-ecs-setup-task-definition)
      + [Infrastructure Requirements](#infrastructure-requirements)
      + [Task Definition Directions](#task-definition-directions)
   * [ECS Service Setup](#ecs-service-setup)
      + [ECS Cluster Security Group](#ecs-cluster-security-group)
      + [Load Balancer Settings](#load-balancer-settings)
      + [Service Configuration](#service-configuration)
      + [Environment](#environment)
      + [Deployment Configuration](#deployment-configuration)
         - [Networking](#networking)
- [Testing](#testing)
   * [Troubleshooting](#troubleshooting)
- [Health Check](#health-check)
         - [Echo Route](#echo-route)
- [Routine Maintenance](#routine-maintenance)
   * [Patches/Updates](#patchesupdates)
      + [Service Limits](#service-limits)
      + [Rotation of Secrets](#rotation-of-secrets)
- [Emergency Maintenance](#emergency-maintenance)
   * [Handling Fault Conditions](#handling-fault-conditions)
   * [How to recover the software](#how-to-recover-the-software)
- [Support](#support)

# Customer Deployment

The MTE API Relay Container is typically used to encode HTTP Requests from a server-side application, proxy the request to another MTE API Relay Container who decodes the request, and proxies the request to the intended API. In AWS, the MTE API Relay Container can be orchestrated as a single or multi-container in an ECS (Elastic Container Service) Task. Orchestration and setup of the container service could take a few hours. While it is possible to deploy this workload in an EKS (Elastic Kubernetes Service) Cluster, this document will focus on a typical deployment in AWS ECS.

### Typical Customer Deployment

In an ideal situation, a customer will already have (or plan to create):

- An application that sends HTTP Requests to another RESTful API Service.
- A second RESTful API Service. This could be in another region, AWS Account, or third-party environment (assuming the third-party has the ability to stand-up an MTE API Relay Container of their own).

Typical Use Case: 
- To encode/decode HTTP Requests between services, an API Relay Container must exist on each side of the transmission.
- At least one API Relay Container will run in the sending environment.
- At least one API Relay Container will run in the receiving environment.

![Typical Use Case](/guides/aws/diagrams/mte-api-relay-use-case.png)

### When completed, the following services and resources will be set up:

| **Service** | **Required** | **Purpose** |
| --- | --- | --- |
| AWS ECS | True | Container Orchestration |
| AWS ElastiCache | True | MTE State Management |
| AWS CloudWatch | True | Logging |
| AWS VPC | True | Virtual Private Cloud |
| Elastic Load Balancer | False | Required if orchestrating multiple containers and/or acting as a receiver of encoded data |
| AWS Secrets Manager | False | Recommended for Environment Variables |

| **Resource** | **Required** | **Purpose** |
| --- | --- | --- |
| _Eclypses MTE API Relay_ container(s) | True | Purchased from the AWS Marketplace |
| ElastiCache for Redis | True | ElastiCache |
| Application Load Balancer | False | Recommended - even for a single container workflow |
| ECS Task | True | Orchestration |

## Deployment Options:

1. The default deployment: Multiple AZ, Single Region
2. For Multi-AZ or Multi-Region deployments, the MTE API Relay Container is a stateful service and will create unique, one-to-one MTE States with individual application sessions. As such, it is important to understand that to deploy multi-region configurations, a single ElastiCache service must be accessible to all regions that might be processing HTTP requests from a single application proxy session.

### Supported Regions:

Not currently supported in:

- GovCloud
- Middle East (Bahrain)
- Middle East (UAE)
- China

## Port Mappings

1. Container runs on port 8080 for HTTP traffic

# Prerequisites and Requirements

## Technical

The following elements are previously required for a successful deployment:

1. An application (or planned application) that communicates with a Web API using HTTP Requests

## Skills or Specialized Knowledge

- Familiarity with AWS ECS (or EKS orchestration)
- General familiarity with AWS Services like ElastiCache

## Configuration

_The customer is required to create the following keys. It is recommended that these keys be stored in AWS Secrets Manager._

The MTE API Relay is configurable using the following **environment variables** :

### Required Configuration Variables:
- `UPSTREAM`
  - **Required**
  - The upstream application IP address, ingress, or URL that inbound requests will be proxied to.
- `CORS_ORIGINS`
  - **Required**
  - A comma-separated list of URLs that will be allowed to make cross-origin requests to the server.
- `CLIENT_ID_SECRET`
  - **Required**
  - A secret that will be used to sign the x-mte-client-id header. A 32+ character string is recommended.
  - Note: This will allow you to personalize your client/server relationship. It is required to validate the sender.
- `REDIS_URL`
  - **Strongly Recommended in Production Environments**
  - The entry point to your Redis ElastiCache cluster. If null, the container will use internal memory. In load-balanced workflows, a common cache location is essential to maintain a paired relationship with the upstream API Relay.

### Optional Configuration Variables:

_The following configuration variables have default values. If the customer does choose to create the following keys, it is recommended that these keys be stored in AWS Secrets Manager._

- `PORT`
  - The port that the server will listen on.
  - Default: `8080`.
  - Note: If this value is changed, make sure it is also changed in your application load balancer.
- `DEBUG`
  - A flag that enables debug logging.
  - Default: `false`
- `PASS_THROUGH_ROUTES`
  - A list of routes that will be passed through to the upstream application without being MTE encoded/decoded.
  - example: "/some_route_that_is_not_secret"
- `MTE_ROUTES`
  - A list of routes that will be MTE encoded/decoded. If this optional property is included, only the routes listed will be MTE encoded/decoded, and any routes not listed here or in `PASS_THROUGH_ROUTES` will 404. If this optional property is not included, all routes not listed in `PASSTHROUGH_ROUTES` will be MTE encoded/decoded.
- `CORS_METHODS`
  - A list of HTTP methods that will be allowed to make cross-origin requests to the server.
  - Default: `GET, POST, PUT, DELETE`.
  - Note: `OPTIONS` and `HEAD` are always allowed.
- `HEADERS`
  - An object of headers that will be added to all request/responses.
- `MAX_POOL_SIZE`
  - The number of encoder objects and decoder objects held in a pool. A larger pool will consume more memory, but it will also handle more traffic more quickly. This number is applied to all four pools; the MTE Encoder, MTE Decoder, MKE Encoder, and MKE Decoder pools.
  - Default: `25`  
- `OUTBOUND_TOKEN`
  - The value appended to the x-mte-outbound-token header to denote the intended outbound recipient.

### YAML Configuration Examples
[AWS Task Definition Parameters](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/taskdef-envfiles.html)
#### Minimal Configuration Example
```yaml
upstream: https://api.my-company.com
clientIdSecret: 2DkV4DDabehO8cifDktdF9elKJL0CKrk
corsOrigins:
  - https://www.my-company.com
  - https://dashboard.my-company.com
redisURL: redis://10.0.1.230:6379
```

#### Full Configuration Example

```yaml
upstream: https://api.my-company.com
clientIdSecret: 2DkV4DDabehO8cifDktdF9elKJL0CKrk
corsOrigins:
  - https://www.my-company.com
  - https://dashboard.my-company.com
redisURL: redis://10.0.1.230:6379
port: 3000
debug: true
passThroughRoutes:
  - /health
  - /version
mteRoutes:
  - /api/v1/*
  - /api/v2/*
corsMethods:
  - GET
  - POST
  - DELETE
headers:
  x-service-name: mte-relay
maxPoolSize: 10
outboundToken: abcdefg1234567
```

### ENV Configuration Examples
- [AWS Task Definition Environment File](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/use-environment-file.html)
- [AWS Retrieve Secrets Manager Secrets](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html)
#### Minimal Configuration Example
```env
UPSTREAM='https://api.my-company.com'
CLIENT_ID_SECRET='2DkV4DDabehO8cifDktdF9elKJL0CKrk'
CORS_ORIGINS='https://www.my-company.com,https://dashboard.my-company.com'
REDIS_URL='redis://10.0.1.230:6379'
```

#### Full Configuration Example

```env
UPSTREAM='https://api.my-company.com'
CLIENT_ID_SECRET='2DkV4DDabehO8cifDktdF9elKJL0CKrk'
CORS_ORIGINS='https://www.my-company.com,https://dashboard.my-company.com'
REDIS_URL='redis://10.0.1.230:6379'
PORT=3000
DEBUG=true
PASS_THROUGH_ROUTES='/health,/version'
MTE_ROUTES='/api/v1/*,/api/v2/*'
CORS_METHODS='GET,POST,DELETE'
HEADERS='{"x-service-name":"mte-relay"}'
MAX_POOL_SIZE=10
OUTBOUND_TOKEN='abcdefg1234567`
```

### Database Credentials:

None

### Key/Variable Rotation Recommendations:

It is not necessary to rotate any keys in the Environment Variables section as they do not have any cryptographic value. However, it would good practice to [rotate](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html) the "CLIENT\_ID\_SECRET" every 90 days (about 3 months) as recommended by many modern best-practices.

# Architecture Diagrams

## Default Deployment - ECS Deployment ![ECS Deployment](/guides/aws/diagrams/aws_ecs_s2s_diagram.png)

## Alternative Deployment - EKS Deployment – Multiple Load- Balanced Containers ![EKS Deployment – Multiple Load- Balanced Containers](/guides//aws/diagrams/aws_eks_s2s_diagram.png)

_\*This process is not described in this document_

# Security

The MTE API Relay does not require AWS account root privilege for deployment or operation. The container only facilitates the data as it moves from client to server and does not store any sensitive data.

## AWS Identity and Access Management (IAM) Roles:

#### In Elastic Container Services (ECS), create a new Task Definition.

Give your task definition appropriate roles:

- **ecsTaskExecutionRole**

- Note: The task must have access to the `AWSMarketplaceMeteringRegisterUsage` role.

#### For dependencies:

- **AWSServiceRoleForElastiCache:** Permission to read/write from ElastiCache instance
- **AWSServiceRoleForCloudWatch:** Permission to write to AWS CloudWatch log service

### VPC (Virtual Private Cloud)

While traffic is protected between the client application and MTE API Relay Server, the traffic is not encoded while it is proxied to the upstream service. The MTE API Relay Container should be deployed in the same VPC as the upstream servers so that proxied traffic can remain internal only. See the architecture diagrams for a visual representation.

# Costs

The MTE API Relay Container is a usage-based model based on Cost/Unit/Hr, where a unit = AWS ECS Task. See the marketplace listing for costs.

### Billable Services

| **Service** | **Required** | **Purpose** |
| --- | --- | --- |
| AWS ECS | True | Container Orchestration |
| AWS ElastiCache | True | MTE State Management |
| AWS CloudWatch | True | Logging |
| AWS VPC | True | Recommended |
| Elastic Load Balancer | False | Required if orchestrating multiple containers and/or acting as a receiver of encoded data |
| AWS Secrets Manager | False | Recommended for Environment Variables |

# Sizing

## ECS

The API Relay can be load-balanced as needed and configured for autoscaling. There are no size requirements.

- The MTE API Relay Container workload is subject to [ECS Service Limits.](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-quotas.html)

# Deployment Assets

## VPC Setup

It is not necessary to create a dedicated VPC for this workflow. Ideally, your MTE API Relay Server is run in the same VPC as your upstream API.

## AWS ElastiCache Redis Setup

### ElastiCache Security Group Settings

- Create a new security group.
- Give your security group a name and description.
  -  `MTERelayElastiCacheSG`
  - Allow traffic from MTE API Relay ECS service.
- Add a new inbound rule.
  - Type: All TCP
  - Source: Custom
    - Click in the search box, and scroll down to select your security group `MteRelayServiceSG`.
  - Description: Allow traffic from MTE API Relay ECS Service.
- If an outbound rule does not already exist to allow all outbound traffic, create one.
  - Type: All Traffic
  - Destination: Anywhere IPv4
- Click **Create Security Group**

### ElastiCache Setup

1. Create ElastiCache cluster
2. Select Redis Interface
    -  Subject to quota [limits](https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/quota-limits.html)
    -  The minimum/maximum defaults should be sufficient
3. Assign your [Security Group](https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/GettingStarted.AuthorizeAccess.html) that allows traffic on port `6379` and `6380` from your MTE API Relay Server ECS instance.
    - Select your newly created cache, then click **Modify** from the top right.
    - Scroll down to Security, then under Security Groups click **Manage**
    - Remove the default security group and add the security group `MTERelayElastiCacheSG`
    - Save these changes.
4. Configure ElastiCache for Redis to the private subnet

## Setting up Elastic Container Service (ECS)
ECS will run the MTE API Relay Container and dynamically scale it when required. To do this, create a task definition to define what a single MTE API Relay Container looks like, create a Service to manage running the containers, and finally create an ECS Cluster for your service to run in.

### Create an ECS Cluster
1. Navigate to ECS, then click "Clusters" from the left side menu.
2. Click "Create cluster"
3. Enter a cluster name.
4. Select `AWS Fargate (serverless)` as the infrastructure.
5. Click Create.

## AWS ECS Setup – Task Definition
### Infrastructure Requirements
- From the left side menu, select Task Definitions
- Click to Create new task definition.
- Create a Task Definition family name;
- Select Launch Type of `AWS Fargate`
- Operating System `Linux x86_64`
- Select `1vCPU` and `2GB Memory`
- Task Roles should be `ecsTaskExecutionRole`

### Task Definition Directions
1. Subscribe to the Container Product from the marketplace
2. Create new Task Definition called MTE API Relay Server
3. Choose ECS Instance launch type; AWS Fargate
4. Choose CPU and Memory. There is no minimum requirement, but `1 CPU` and `2GB memory` is recommended.
5. Give your task definition appropriate roles:
    - `ecsTaskExecutionRole`
    - Note: The task must have access to the `AWSMarketplaceMeteringRegisterUsage` role.
6. Provide the MTE API Relay Docker image URI and give your container a name.
    - It is an essential container
7. Port Mappings
    - Container runs on port 8080 for HTTP traffic
8. Provide [Required Environment Variables](#required-configuration-variables)
    - Additional environment variables can be set. Please see [Optional Configuration Variables](#optional-configuration-variables) for more info.
9. Select to export logs to AWS Cloud Watch
    - Create a new CloudWatch log group, and select the same region your MTE API Relay Server is running in.
    - Subject to CloudWatch [limits](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch_limits.html)
10. Save Task Definition

## ECS Service Setup

After creating the MTE API Relay Task Definition, you can create a new ECS service that utilizes that task definition.

1. Select the MTE API Relay Task Definition and click Deploy \> Create Service
2. Leave "Compute Configuration" defaults.
3. Under Deployment Configuration, name your service MTE API Relay Service
4. For the number of desired tasks, select how many instances of MTE API Relay you would like.
  -  Minimum is 1, and recommended is 2 or more.
5. Under the networking sections, ensure you are launching MTE API Relay in the same VPC as your upstream service.
6. Select, or create a new, [service group](#ECS-Cluster-Security-Group) that will allow traffic from your load balancer. 
7. Create a new [load balancer](#Load-Balancer-Settings) for this service.
8. Set any additional configuration regarding service scaling or tags. These are optional.
9. Save and create the new service.

### ECS Cluster Security Group

- Create a new security group.
- Give your security group a name and description
  - `MteRelayServiceSG`
  - Allow Traffic to MTE API Relay Service
- Add a new inbound rule.
  - Type: All TCP
  - Source: Custom
    - Click in the search box, and scroll down to select your security group for web traffic to your load balancer.
  - Description: Allow traffic from load balancer.
- If an outbound rule does not already exist to allow all outbound traffic, create one.
  - Type: All Traffic
  - Destination: Anywhere IPv4
- Click **Create Security Group**

### Load Balancer Settings

- Navigate to the Elastic Compute Cloud (EC2) service.
- From the menu on the left, scroll down to **Network & Security** > **Security Groups**
- Click **Create Security Group** to create a new security group.
- Give your security group a name and description.
  - `PublicWebTrafficSG`
  - Allow public web traffic on ports 80 and 443
- Add a new Inbound rule.
  - Custom TCP
  - Port 80
  - Source from Anywhere-IPv4
  - Description: Allow incoming traffic on port 80.
- Create a second inbound rule for traffic on port 443.
- If an outbound rule does not already exist to allow all outbound traffic, create one.
  - Type: All Traffic
  - Destination: Anywhere IPv4
- Click **Create Security Group**

### Service Configuration

- From the left side menu, click **Clusters**, then click the name of your newly create cluster
- Halfway down the page, ensure the **Services** tab is selected, then click **Create**

### Environment

All default options are fine.

- Capacity Provider is Fargate
- Weight is 1
- Version is latest.

### Deployment Configuration

- Use the Family dropdown to select the Family Name you create in your task definition.
- Select the latest revision of that task definition
- Name your service
- Desired tasks: 1 is ok to test. If you have more traffic, you may choose to run 2 or more instances of MTE API Relay Server.

#### Networking

- Select your desired VPC, if you have more than one.
- Choose your subnets. Select all if you're not sure.
- Under security groups, remove any default groups, and add the security group **MteRelayServiceSG**

# Testing

Once the API Relay Server is configured:

- Monitor logs in CloudWatch – check for initialization errors.
  - On successful startup, you should see two logs
    - MTE instantiated successfully.
    - Server listening at http://[0.0.0.0]:8080
- To test that the API Service is active and running, submit an HTTPGet request to the echo route:
  - curl 'https://[your\_domain]/api/mte-echo/test' 
  - Successful response: {"echo":"test","time"[UTC datetime]}

Once both sides of the transmission have at least one API Relay Container:
- Import The [Postman Collection](/guides/aws/postman/MTE-Relay-Server-to-Server.postman_collection.json) following these [directions](https://apidog.com/blog/how-to-import-export-postman-collection-data/#:~:text=Open%20Postman%20and%20click%20on,Collections%22%20on%20the%20left%20sidebar.) 
- Once imported, click the ellipses (...) next to the created collection and select "Edit".
- Navigate to the "Variables" tab.
- Change the "Current value" of the "DOMAIN" variable to the URL for API Relay #1.
- Change the "Current value" of the "UPSTREAM" variable to the URL for API Relay #2.
![Example Configuration](/guides/aws/postman/postman-s2s-variables.png)
- Test the /Echo and /MTE-Relay Routes for general tests.
  - Success Criteria
  ![Success Criteria](/guides/aws/diagrams/api-relay-echo-test-success.png)
  - Failure Criteria
  ![Failure Criteria](/guides/aws/diagrams/api-relay-echo-test-failure.png)
- Test the HTTP Requests in the Demo Directory for full continuity. 
  - Success Criteria
  ![Success Criteria](/guides/aws/diagrams/api-relay-patients-test-success.png)
  - Failure Criteria
  ![Failure Criteria](/guides/aws/diagrams/api-relay-patients-test-failure.png)
## Troubleshooting

Most problems can be determined by consulting the logs in AWS CloudWatch. Some common problems that might occur are:

1. Invalid Configuration
2. Network misconfiguration

Some specific error examples include:

- I cannot reach my API Relay Container.
  - Double check your Security Group allows traffic from your load balancer.
  - Check CloudWatch
- Server exits with a `ZodError`
  - This is a config validation error. Look at the "path" property to determine which of the required Environment Variables you did not set. For example, if the path property shows "upstream," then you forgot to set the environment variable "UPSTREAM."
- Server cannot reach ElastiCache.
  - Check that ElastiCache is started in same VPC.
  - Check that ElastiCache security group allows traffic from MTE API Relay ECS instance.
  - If using credentials, check that credentials are correct.

MTE API Relay Server includes a Debug flag, which you can enable by setting the environment variable "DEBUG" to true. This will enable additional logging that you can review in CloudWatch to determine the source of any issues.

# Health Check

For short and long-term health – monitor logs in the AWS CloudWatch service.

#### Echo Route

The Echo route can be called by an automated system to determine if the service is still running. To test that the API Service is active and running, submit an HTTPGet request to the echo route:

`curl 'https://[your\_domain]/api/mte-echo/test' `

Successful response: `{"echo":"test","time"[UTC datetime]}`

# Routine Maintenance

## Patches/Updates

Updated images are distributed through the marketplace.

### Service Limits

- ECS
  - The MTE API Relay Container workload is subject to [ECS Service Limits.](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-quotas.html)
- ElastiCache
- CloudWatch
  - [Setting up alerts](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch_limits.html)
- ELB (Elastic Load Balancer)
  - The MTE API Relay Container workload is subject to [ELB Service Limits:](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-limits.html)

### Rotation of Secrets

[Rotate](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html) the `CLIENT_ID_SECRET`every 90 days (about 3 months) as recommended by many modern best-practices.

# Emergency Maintenance

## Handling Fault Conditions

Tips for solving error states:

1. Review all tips from Trouble Shooting section above.
2. Check ECS CloudWatch Logs for more information
3. Configuration mismatch
    - Double-check environment variables for errors

## How to recover the software

The MTE API Relay Container ECS task can be relaunched. While current sessions may be affected, the container will seamlessly manage the re-pairing process with the MTE API Relay Upstream Server and the end-user should not be affected.

# Support

The Eclypses support center is available to assist with inquiries about our products from 8:00 am to 8:00 pm MST, Monday through Friday, excluding Eclypses holidays. Our committed team of expert developer support representatives handles all incoming questions directed to the following email address: [customer\_support@eclypses.com](mailto:customer_support@eclypses.com)