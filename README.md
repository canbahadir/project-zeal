# project-zeal

GCP example project using GKE + Docker + GCR + Helm + Prometheus/Grafana + Sonarqube + Gremlin.


## Overall architecture

![Zeal GKE Architecture](https://github.com/canbahadir/project-zeal/blob/development/zeal_gke_arch.png?raw=true)


## Set up environment

Setup a vagrant environment to work with. Then use it with VS Code.

STEPS:

On your preferred OS download Vagrant & Virtual Box.
For this task I chosed to work with centos-8.
Setup a Vagrant Box ( https://app.vagrantup.com/bento/boxes/centos-8 )
Create a folder for vagrant boxes on your machine.
Open terminal

    cd <vagrant-box-folder>
    vagrant init bento/centos-8
    vagrant up


On VS Code install remote - SSH extension ( https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-ssh ) 

Get ssh config from Vagrant

    vagrant ssh-config

Add output to VS Code Remote-SSH config file.
Connect to vagrant box using Remote-SSH.

Open terminal in VS Code and install needed packages:
Upgrade default packages.

    sudo dnf update
    sudo dnf upgrade

Add google cloud sdk repo

    sudo tee -a /etc/yum.repos.d/google-cloud-sdk.repo << EOM
    [google-cloud-sdk]
    name=Google Cloud SDK
    baseurl=https://packages.cloud.google.com/yum/repos/cloud-sdk-el7-x86_64
    enabled=1
    gpgcheck=1
    repo_gpgcheck=1
    gpgkey=https://packages.cloud.google.com/yum/doc/yum-key.gpg
        https://packages.cloud.google.com/yum/doc/rpm-package-key.gpg
    EOM

Install google cloud sdk

    sudo dnf install google-cloud-sdk

Initiate gcloud and give access to google account.

    gcloud init

Install git

    sudo dnf install git

Setup brew package manager

    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> /home/vagrant/.bash_profile
    eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
    sudo yum groupinstall 'Development Tools'
    brew install gcc

Install kubectl, terraform, and helm.

    sudo dnf install kubectl
    brew install helm


## Create a GKE cluster

Enable some services to use in further steps.

    gcloud services enable sourcerepo.googleapis.com
    gcloud services enable compute.googleapis.com
    gcloud services enable servicemanagement.googleapis.com
    gcloud services enable storage-api.googleapis.com
    gcloud services enable service:container.googleapis.com
    gcloud services enable container.googleapis.com

Deploy a typical GKE cluster.

    gcloud container clusters create developmentcluster --machine-type=n1-standard-1 --num-nodes 1 --enable-autoscaling --min-nodes 1 --max-nodes 2


## Set up ingress-nginx for default namespace

Reserve a regional IP

    gcloud compute addresses create endpoints-ip --region us-central1

Get IP

    [vagrant@localhost ~]$ gcloud compute addresses list
    NAME          ADDRESS/RANGE   TYPE      PURPOSE  NETWORK  REGION       SUBNET  STATUS
    endpoints-ip  xxx.xxx.xxx.xxx  EXTERNAL                    us-central1          IN_USE

Add nginx helm repo

    helm repo add nginx-stable https://helm.nginx.com/stable
    helm repo update

Deploy ingress resource:

    helm install nginx-ingress nginx-stable/nginx-ingress --set rbac.create=true --set controller.service.loadBalancerIP="xxx.xxx.xxx.xxx"

Apply ingress resource to sync with app service:

    kubectl apply -f /home/vagrant/cloud-native-challenges/task4/helmchart-basics/ingress.yaml


## Set up Cloud Build

Used Cloud Build as CI tool.

CI configuration file can be found with name couldbuild.yaml in this repo.
This CI configuration consist of 4 steps and triggered by commit to main branch.

1. Sonarqube scan of repo with QualityGate(default settings) check.
2. Creating a new docker image from task3/dockerapp folder.
3. Pushing new image to GCR (Google Container Registry)
4. Deploying or if deployed, upgrading helm chart with new image.


To do these steps there are prerequisities:
 
Go to cloud build settings and enable Kubernetes Engine Developer role for cloud build. Otherwise it cannot access to GKE clusters.

By default cloud build does not include sonar scanner and helm images so cant use those commands.

To enable them we should push images to our project. There is a cloud-builders-community github repository for managing those images easily. To do this run following commands.

    #helm
    git clone https://github.com/GoogleCloudPlatform/cloud-builders-community.git
    cd cloud-builders-community/helm
    gcloud builds submit . --config=cloudbuild.yaml

    #Sonarqube
    #Open Dockerfile /cloud-builders-community/sonarqube/Dockerfile
    #Add following lines before run section
    #   ENV TZ=Europe/Istanbul
    #   RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
    #Update apt-get line like this:
    #   && apt-get install -y openjdk-11-jdk-headless tzdata curl unzip bash nodejs npm \
    cd ../sonarqube/
    gcloud builds submit . --config=cloudbuild.yaml

Also to use sonarscanner we need to create a sonarqube account, connect our repository and get credentials for cloud build. Check https://sonarcloud.io/ . Following parameters needed to be filled.

    - '-Dsonar.host.url=https://sonarcloud.io'
    - '-Dsonar.login=<AUTH_TOKEN - get from https://sonarcloud.io/account/security/'
    - '-Dsonar.projectKey=canbahadir_project-zeal' // get yours from sonarqube project page > Analysis Method > Other CI > Other (for JS, TS, Go, Python, PHP, ...) > Linux 
    - '-Dsonar.organization=canbahadir' // get yours from sonarqube project page > Analysis Method > Other CI > Other (for JS, TS, Go, Python, PHP, ...) > Linux  
    - '-Dsonar.sources=.' 

Now everything is ready to work within cloud build.
Go to cloud build page, navigate to triggers section, click to create trigger. Connect github account/repository select main branch and select trigger on commit. It will work on commit and results also will be seen on github commits.

Now my app is reachable at:

[kube.bcan.me](kube.bcan.me)


## Set up Prometheus/Grafana

Add prometheus-community helm repo

    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo update

Apply a kube-prometheus-stack deployment using helm on a different namespace

    helm install promstack prometheus-community/kube-prometheus-stack --create-namespace --namespace=monitoring


Check if pods and services are ok

    kubectl get pods --all-namespaces
    kubectl get svc --all-namespaces

Get a second static ip to forward

    gcloud compute addresses create grafana-ip --region us-central1
    gcloud compute addresses list

Set second ingress controller with different class and with newly created static ip

    helm install monitoring-ingress nginx-stable/nginx-ingress --set rbac.create=true --set controller.service.loadBalancerIP=<grafana-ip> --set controller.ingressClass=nginx-monitoring  --namespace=monitoring 

Apply ingress-resource for monitoring stack.

    kubectl apply -f misc/ingress-monitoring.yaml

Now my app is reachable at:

[grafana.bcan.me](grafana.bcan.me)


## Chaos Engineering with Gremlin

We can apply various system resource test with gremlin free tier and test our systems reliability.

https://www.gremlin.com/blog/introducing-gremlin-free/


Signup/login from here: https://app.gremlin.com/signup

Add Gremlin helm repo

    helm repo add gremlin https://helm.gremlin.com

Create Gremlin namespace

    kubectl create namespace gremlin

Go to Team Settings > Configuration Page from Gremlin website.  Get TEAM_ID and create TEAM_SECRET from this page. Give anything to clusterID as you wish.

Deploy Gremlin

    helm install gremlin gremlin/gremlin \
        --namespace gremlin \
        --set gremlin.secret.managed=true \
        --set gremlin.secret.type=secret \
        --set gremlin.secret.teamID=$GREMLIN_TEAM_ID \
        --set gremlin.secret.clusterID=$GREMLIN_CLUSTER_ID \
        --set gremlin.secret.teamSecret=$GREMLIN_TEAM_SECRET

Now we should be able to see our cluster on Gremlin GUI. From there either click attack or click scenario to design and start a chaos engineering test.

