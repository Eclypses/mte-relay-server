# MTE Relay Server AWS Usage Guide

The MTE Relay Server is an HTTP proxy server written in JavaScript that proxies requests and responses using MTE encoding/decoding to protect data traveling across the open internet. It is available through the AWS Marketplace and can be quickly and easily stood up using Elastic Container Service (ECS). This guide describes how to do that.

> Note: You should have some familiarity with the AWS platform, starting and stopping services, and the IAM permissions system.

## AWS Resources

The AWS resources that will be used in this guide.

- Elastic Container Service (ECS)
- Elasticache Redis
- Cloudwatch
- Elastic Load Balancer (ELB)
- Virtual Private Cloud

## Setting up the MTE Relay Server

### 1. Security Groups

Three security groups will need to be created to specify what web traffic is allowed to reach each service. Set these up first, so they can be assigned as we create each new service below.

#### Load Balancer Security Group

- Navigate to the Elastic Compute Cloud (EC2) service.
- From the menu on the left, scroll down to **Network & Security** > **Security Groups**
- Click **Create Security Group** to create a new security group.
- Give your security group a name and description.
  - PublicWebTrafficSG
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

#### ECS Cluster Security Group

- Create a new security group.
- Give your security group a name and description
  - MteRelayServiceSG
  - Allow Traffic to MTE Relay Service
- Add a new inbound rule.
  - Type: All TCP
  - Source: Custom
    - Click in the search box, and scroll down to select your security group for web traffic to your load balancer.
  - Description: Allow traffic from load balancer.
- If an outbound rule does not already exist to allow all outbound traffic, create one.
  - Type: All Traffic
  - Destination: Anywhere IPv4
- Click **Create Security Group**

#### Elasticache Security Group

- Create a new security group.
- Give your security group a name and description.
  - MTERelayElasticacheSG
  - Allow traffic from MTE Relay ECS service.
- Add a new inbound rule.
  - Type: All TCP
  - Source: Custom
    - Click in the search box, and scroll down to select your security group MteRelayServiceSG.
  - Description: Allow traffic from MTE Relay ECS Service.
- If an outbound rule does not already exist to allow all outbound traffic, create one.
  - Type: All Traffic
  - Destination: Anywhere IPv4
- Click **Create Security Group**

### 2. Setting Up Elasticache

Elasticache is a required service for MTE Relay. It acts as an external data store that allows container instances to dynamically scale while persisting data and sharing data between them.

- Navigate to the Elasticache service.
- Select "Redis Caches" from the left-side menu.
- Click the button that says "Create Redis Cache"
- Select "Serverless"
- Select "New Cache"
- Give your cache a name and description.
- Leave default settings alone.
- Optionally, add tags.
- Click "Create" to create your new Redis Elasticache.

Once your cache is created, click on it to view it's information and make note of it's **Endpoint URL**. This needs to be provided to MTE Relay Server as an environment variable in later steps. It should look like this:\
`my-cache-name-abc123.serverless.use1.cache.amazonaws.com:6379`

#### Add the correct Security Group to Elasticache

- Select your newly created cache, then click **Modify** from the top right.
- Scroll down to Security, then under Security Groups click **Manage**
- Remove the default security group and add the security group **MTERelayElasticacheSG**
- Save these changes.

### 3. Setting up Elastic Container Service (ECS)

ECS will run the MTE Relay container and dynamically scale it when required. To do this, create a task definition to define what a single MTE Relay container looks like, create a Service to manage running the containers, and finally create an ECS Cluster for your service to run in.

#### Create an ECS Cluster

- Navigate to ECS, then click "Clusters" from the left side menu.
- Click "Create cluster"
- Enter a cluster name.
- Select AWS Fargate (serverless) as the infrastructure
- Click Create

#### Task Definition Configuration

##### Infrastructure Requirements

- From the left side menu, select Task Definitions
- Click to Create new task definition.
- Create a Task Definition family name;
- Select Launch Type of AWS Fargate
- Operating System Linux x86_64
- Select 1vCPU and 2GB Memory
- Task Roles should be "ecsTaskExecutionRole"

##### Container -1

- Name your container MTE Relay
- Paste in the repository URL for the MTE Relay product image. This is provided to you when you subscribe to MTE Relay Server.
- This is an essential container.
- Set the container port to 8080, TCP, give it any name, and HTTP protocol.
- Optionally set resource allocation limits. Default values are ok.
- Set environment variables:
  - UPSTREAM - The upstream server to proxy requests to.
  - CORS_ORIGINS - A coma-separated list of origins that can make requests to this Relay server.
  - SERVER_ID - A secret string used for signing cookies; a 32+ character string is recommended.
  - REDIS_URL - The entry point to your Redis ElastiCache cluster.
  - You can set additional environment variables to changes the behavior of the server. See the ReadMe file for details.
- Select "Use log Collection" and select CloudWatch. Default values are fine.
- All other defaults are fine. Click "Create" to create this Task Definition.

#### Service Configuration

- From the left side menu, click **Clusters**, then click the name of your newly create cluster
- Halfway down the page, ensure the **Services** tab is selected, then click **Create**

##### Environment

All default options are fine.

- Capacity Provider is Fargate
- Weight is 1
- Version is latest.

##### Deployment Configuration

- Use the Family dropdown to select the Family Name you create in your task definition.
- Select the latest revision of that task definition
- Name your service
- Desired tasks 1 is ok to test. If you have more traffic, you may choose to run 2 or more instances of MTE Relay Server.

##### Networking

- Select your desired VPC, if you have more than one.
- Choose your subnets. Select all if you're not sure.
- Under security groups, remove any default groups, and add the security group **MteRelayServiceSG**

##### Load Balancing

- Set the Load Balancer Type to Application Load Balancer
- Select to create a new Load Balancer
- Name your load balancer **MteRelayLB**
- The health check path can

Scroll to the bottom and click **Create** to create this service. You should be brought to a screen that shows metrics about this service, and updates as it's being created.

### 4. Update Security Group for Load Balancer

Assign a security group that allows public internet traffic to reach the load balancer.

- Navigate to the Elastic Compute Cloud (EC2) service.
- From the menu on the left, scroll down to **Load Balancers**.
- Select the Load Balancer previously created **MteRelayLB**.
- Halfway down the page, select the **Security** tab, then click **Edit**.
- Add the security group **PublicWebTrafficSG**
- Remove other security groups.
- click **Save Changes**.

### 5. Verify Setup is complete

- Open you Load Balancer settings and copy the DNS name.
- Open a new tab and paste the DNS name, then append this path to it `/api/mte-echo`
- Press enter to go to that URL. You should see a successful response.

## MTE Relay Client-Side Setup

The MTE Relay server provides access to the client JavaScript module required to encode/decode data on the client.

- Navigate to your load balancer, and append the path `/public/mte-relay-client.js`
- Include this JS module in your website code
  - Include a `<script src=".../public/mte-relay-client.js"></script>` tag.
  - Save the JS file and add it to the source code of your website.
- Use the exported method `mteFetch()` to send/receive encrypted data to/from your MTE Relay server.

```js
// use mteFetch to handle pairing, encoding data, and sending/receiving it
const response = await mteFetch(
  "https://mte-relay-server.example.com/api/[your_api_route]",
  {
    method: "POST",
    body: JSON.stringify({ data }),
  }
);
const data = await response.json();
```

## Conclusion

At this point, you have successfully create an MTE Relay server on AWS and integrated the client module into your website code. While it is outside the scope of this guide, your next step should be to configure a custom DNS for your MTE Relay server and forward traffic at that DNS to your load balancer, and to default to using HTTPS traffic.

If you have questions or need assistance, please send an email to support@eclypses.com.
