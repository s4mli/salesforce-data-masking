#!/bin/bash
set -e
echo "Deploying $1"
PWD=$(pwd)
DIRNAME=$(dirname $0)
echo $DIRNAME
cd $DIRNAME/../service
PWD=$(pwd)
npm install -g aws-cdk
npm install
npm run build
cdk synth $1
cdk deploy $1 --require-approval "never"
